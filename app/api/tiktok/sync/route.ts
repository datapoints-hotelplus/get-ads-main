/**
 * app/api/tiktok/sync/route.ts
 * POST /api/tiktok/sync
 *
 * Callable from the admin "Sync Now" button (session cookie) OR externally
 * from n8n / any cron (Authorization: Bearer SYNC_TRIGGER_SECRET) — see
 * lib/syncAuth.ts. Pass ?source=n8n|cron to label the trigger in the log;
 * defaults to "n8n" when called via the secret and "manual" via session.
 *
 * Step 1 – Fetch all advertiser IDs the token can access
 * Step 2 – For each advertiser, pull ad-level insights (365 days, or the
 *          full history since the account's first sync — F12) in 30-day
 *          chunks (to respect API limits)
 * Step 3 – Upsert rows into tiktok_ads_rawdata
 * Step 4 – Fetch ad creatives (video thumbnails) and upsert into tiktok_ad_creatives
 * Step 5 – Save/refresh advertiser list in tiktok_advertisers
 *
 * Every attempt is recorded in tiktok_sync_log (F09/F10). After 2+
 * consecutive failures, an alert email goes out (F27).
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { daysAgoIn } from "@/lib/adDate";
import { sendAlertEmail } from "@/lib/email";

// A first-ever (3-year) backfill across several advertisers easily runs past
// Vercel's default function timeout — without this, a slow sync gets killed
// mid-request and the client receives an HTML timeout page instead of JSON.
// (Hobby plan caps this at 60s regardless; Pro+ honors up to 300s.)
export const maxDuration = 300;
import { checkTokenExpiryAndAlert } from "@/lib/tiktok-token";
import {
  fetchAllAdvertisers,
  fetchAdInsights,
  fetchAdCreatives,
  fetchAudienceDemographics,
  fetchAudienceLocations,
  fetchAudienceInterests,
  fetchRegionNames,
  fetchInterestCategoryNames,
  fetchCampaignObjectives,
  chunkDateRange,
  formatTikTokError,
  setActiveSyncLogId,
  setStatusDetail,
  type TikTokAdStat,
  type TikTokAdvertiser,
} from "@/lib/tiktok-ads";
import type { SupabaseClient } from "@supabase/supabase-js";

// 365 is TikTok's max span WITHOUT a stat_time_day dimension — but every
// current caller (fetchAdInsights, fetchAudienceDemographics,
// fetchAudienceLocations — see syncOneAdvertiser below) requests
// stat_time_day for daily granularity, and TikTok caps THAT combination at
// 30 days (confirmed live: "max time span is 30 days when use
// stat_time_day"). A 365-day chunk here fails outright for all of them, so
// a first sync silently drops every ad-performance row. Back to 30 until a
// caller that doesn't need stat_time_day gets its own chunk size.
const CHUNK_DAYS = 30;
// TikTok's real limit (confirmed via a live error) is 10 QPS app-wide, and
// every request now funnels through a shared rate gate in lib/tiktok-ads.ts
// that enforces that centrally — so this concurrency number no longer needs
// to be a cautious guess. More "workers" just means requests are queued up
// ready to fire the instant the gate allows the next one; they can't push
// the actual request rate past what the gate lets through either way.
const ADVERTISER_CONCURRENCY = 10;
// EC5: Vercel hard-kills the function at maxDuration with no graceful
// warning — the client gets an HTML timeout page instead of JSON (see
// safeJson() in app/tiktok/sync/page.tsx), and any advertiser mid-batch
// loses ALL its progress from that batch, not just what didn't fit. This
// budget stops STARTING new batches once elapsed time gets close, so the
// function returns a normal (partial) JSON response on its own terms
// instead of getting killed. 40s margin under the 300s maxDuration covers
// the in-flight batch finishing + the province-name backfill pass +
// finishSyncLog. Safe either way — sync is incremental/idempotent, so
// whatever didn't make it this run gets picked up next run.
const TIME_BUDGET_MS = 260_000;
const DEFAULT_LOOKBACK_DAYS = 365;
const FIRST_SYNC_LOOKBACK_DAYS = 365 * 3; // F12: no per-account "created_at" from the API, so
// first-ever sync reaches back 3 years instead of guessing the true account age.
// ponytail: fixed window, not a real "since account creation" lookup — raise
// FIRST_SYNC_LOOKBACK_DAYS (or wire up advertiser create_time once TikTok's
// /advertiser/info/ response is confirmed to include it) if 3 years isn't enough.

// EC8: another attempt's "running" row IS the lock — no separate lock table.
// A row stuck at "running" past the sync route's own 300s function budget
// is a crashed/timed-out attempt, not a real lock, so it's ignored (~6min
// margin over maxDuration) rather than requiring a manual unlock.
const STALE_RUNNING_MS = 6 * 60 * 1000;

async function findRunningSync(sb: SupabaseClient): Promise<{ id: number; started_at: string } | null> {
  const { data } = await sb
    .from("tiktok_sync_log")
    .select("id, started_at")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const age = Date.now() - new Date(data.started_at).getTime();
  if (age > STALE_RUNNING_MS) return null; // crashed attempt, not a real lock
  return data;
}

// EC12: storage-throttle switch — set by the upsert-error handler below when
// writes start failing in a way that looks like "out of space", cleared only
// by an admin (never auto-cleared, so nothing resumes silently).
async function isSyncPaused(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.from("tiktok_sync_control").select("sync_paused, pause_reason").eq("id", 1).maybeSingle();
  return data?.sync_paused ? (data.pause_reason ?? "Sync ถูกพักไว้") : null;
}

async function startSyncLog(triggeredBy: string, totalAdvertisers: number): Promise<number | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("tiktok_sync_log")
    .insert({ status: "running", triggered_by: triggeredBy, total_advertisers: totalAdvertisers })
    .select("id")
    .single();
  if (error) {
    console.error("[tiktok/sync] failed to create sync_log row:", error.message);
    return null;
  }
  return data.id as number;
}

// EC5/AC13: called once per batch from the already-sequential main loop
// below (never concurrently), so a plain read-then-write is safe — no two
// callers can race each other.
async function bumpCompletedCount(sb: SupabaseClient, logId: number | null, delta: number) {
  if (logId === null || delta === 0) return;
  const { data } = await sb.from("tiktok_sync_log").select("completed_advertisers").eq("id", logId).maybeSingle();
  const current = data?.completed_advertisers ?? 0;
  await sb.from("tiktok_sync_log").update({ completed_advertisers: current + delta, status_detail: null }).eq("id", logId);
}

// EC12: storage-exhaustion errors from Postgres/Supabase look like this —
// best-effort pattern match, same spirit as categorizeTikTokError.
function looksLikeStorageError(message: string): boolean {
  return /no space left|disk full|quota exceeded|database.*full|could not extend file|insufficient storage/i.test(message);
}
async function pauseSyncForStorage(sb: SupabaseClient, detail: string) {
  await sb.from("tiktok_sync_control").upsert(
    { id: 1, sync_paused: true, pause_reason: `Storage เต็ม/ใกล้เต็ม — sync ถูกพักอัตโนมัติ: ${detail}`, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  await sendAlertEmail(
    "[TikTok Ads] Storage เต็ม/ใกล้เต็ม — sync ถูกพักอัตโนมัติ",
    `<p>Database เขียนข้อมูลไม่สำเร็จด้วย error ที่ดูเหมือน storage เต็ม sync ถูกพักไว้อัตโนมัติจนกว่า admin จะปลดล็อกที่ tiktok_sync_control (ไม่มีการลบข้อมูลเก่าอัตโนมัติ)</p><p>Detail: ${detail}</p>`,
  );
}

async function finishSyncLog(
  logId: number | null,
  status: "success" | "fail",
  recordsSynced: number,
  errorMessage?: string,
) {
  if (logId === null) return;
  const sb = getSupabase();
  await sb
    .from("tiktok_sync_log")
    .update({
      status,
      records_synced: recordsSynced,
      error_message: errorMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", logId);
}

/** F27: email alert once 2+ syncs have failed in a row. */
async function checkConsecutiveFailures() {
  const sb = getSupabase();
  const { data } = await sb
    .from("tiktok_sync_log")
    .select("status")
    .order("started_at", { ascending: false })
    .limit(3);

  const rows = data ?? [];
  const consecutiveFails = rows.findIndex((r) => r.status !== "fail");
  const failCount = consecutiveFails === -1 ? rows.length : consecutiveFails;

  if (failCount >= 2) {
    await sendAlertEmail(
      `[TikTok Ads] Sync failing — ${failCount} attempts in a row`,
      `<p>TikTok Ads sync has failed ${failCount} times in a row. Please check the connection at /tiktok/sync.</p>`,
    );
  }
}

/** One advertiser's full sync (ads + creatives + campaigns + audience + interests). */
async function syncOneAdvertiser(
  sb: SupabaseClient,
  adv: TikTokAdvertiser,
  endStr: string,
  lookbackOverride: number | null,
): Promise<{ advertiser_id: string; advertiser_name: string; rows: number; error?: string; startStr: string }> {
  // F12: first-ever sync for this advertiser pulls a much longer history.
  const { count: existingRows } = await sb
    .from("tiktok_ads_rawdata")
    .select("id", { count: "exact", head: true })
    .eq("advertiser_id", adv.advertiser_id);
  const isFirstSync = !existingRows;

  // Admin can override the lookback window from the sync page ("3 เดือน" /
  // "ทั้งหมด") instead of always relying on the isFirstSync guess.
  const lookbackDays = lookbackOverride ?? (isFirstSync ? FIRST_SYNC_LOOKBACK_DAYS : DEFAULT_LOOKBACK_DAYS);

  const startStr = daysAgoIn(lookbackDays);
  const chunks = chunkDateRange(startStr, endStr, CHUNK_DAYS);

  let totalRows = 0;
  let advError: string | undefined;
  const seenAdIds = new Set<string>();
  const droppedMetrics = new Set<string>(); // EC4 — union across every chunk

  // ── Step 5 moved ahead of Step 1: Campaign objectives ──────────────────
  // Fetched first (not after ad insights, and not backfilled via a separate
  // per-row UPDATE afterward) so objective_type can be written directly
  // into each tiktok_ads_rawdata row on its one and only insert. The old
  // "insert then backfill by matching campaign_id" approach wrote zero rows
  // in practice — confirmed live (0/3084 rows had objective_type) — safer
  // to just have the data on hand before the row is ever written.
  const campaignObjectiveMap = new Map<string, string>(); // campaign_id → objective_type
  // Only true once this run's campaign fetch actually succeeds — guards the
  // same overwrite trap as creatives/province: if the fetch fails, every ads
  // row built below must leave objective_type untouched (not null it out),
  // since campaignObjectiveMap being empty here could just mean "API call
  // failed this run", not "these campaigns have no objective."
  let campaignsFetchSucceeded = false;
  try {
    const campaigns = await fetchCampaignObjectives(adv.advertiser_id);
    campaignsFetchSucceeded = true;
    if (campaigns.length > 0) {
      for (const c of campaigns) {
        if (c.objective_type) campaignObjectiveMap.set(c.campaign_id, c.objective_type);
      }
      const CBATCH = 200;
      for (let i = 0; i < campaigns.length; i += CBATCH) {
        await sb.from("tiktok_campaigns").upsert(
          campaigns.slice(i, i + CBATCH).map((c) => ({
            campaign_id: c.campaign_id,
            advertiser_id: c.advertiser_id,
            campaign_name: c.campaign_name || null,
            objective_type: c.objective_type || null,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "campaign_id" },
        );
      }
    }
  } catch (err) {
    console.error(`[tiktok/sync] campaigns ${adv.advertiser_id}:`, formatTikTokError(err));
  }

  try {
    for (const [chunkIndex, chunk] of chunks.entries()) {
      // Per-advertiser progress only advances once a whole advertiser
      // finishes (see updateProgress below), which for a big backfill can
      // sit at "2/4 accounts" for minutes with no sign anything is moving.
      // This status_detail line reuses the same live-polled field the
      // rate-limit/field-error messages already use — cheap visibility
      // into which chunk is in flight right now.
      // ponytail: with ADVERTISER_CONCURRENCY>1, several advertisers write
      // this same field concurrently — whichever wrote last is what shows
      // on the next poll. Good enough for "is it stuck or moving", not a
      // per-advertiser progress log; upgrade to a per-advertiser row if
      // that granularity is ever actually needed.
      await setStatusDetail(`${adv.advertiser_name}: ad insights ${chunkIndex + 1}/${chunks.length} (${chunk.start}~${chunk.end})`);
      let stats: TikTokAdStat[];
      try {
        const result = await fetchAdInsights(adv.advertiser_id, adv.advertiser_name, chunk.start, chunk.end);
        stats = result.rows;
        for (const m of result.droppedMetrics) droppedMetrics.add(m);
      } catch (err) {
        console.error(`[tiktok/sync] chunk error ${adv.advertiser_id} ${chunk.start}~${chunk.end}:`, formatTikTokError(err));
        continue;
      }

      if (stats.length === 0) continue;

      // Collect ad_ids for creative fetch later
      for (const s of stats) if (s.ad_id) seenAdIds.add(s.ad_id);

      const BATCH = 500;
      for (let i = 0; i < stats.length; i += BATCH) {
        const batch = stats.slice(i, i + BATCH).map((s) => ({
          advertiser_id: s.advertiser_id,
          advertiser_name: adv.advertiser_name,
          campaign_id: s.campaign_id || null,
          campaign_name: s.campaign_name || null,
          // Only ever set when this run's campaign fetch succeeded — see
          // campaignsFetchSucceeded's comment above. `undefined` is dropped
          // from the upsert payload entirely, leaving any existing value alone.
          objective_type: campaignsFetchSucceeded
            ? (s.campaign_id && campaignObjectiveMap.get(s.campaign_id)) || null
            : undefined,
          adgroup_id: s.adgroup_id || null,
          adgroup_name: s.adgroup_name || null,
          ad_id: s.ad_id || null,
          ad_name: s.ad_name || null,
          stat_time_day: s.stat_time_day,
          spend: s.spend,
          impressions: s.impressions,
          reach: s.reach,
          clicks: s.clicks,
          cpm: s.cpm,
          cpc: s.cpc,
          average_video_play: s.average_video_play,
          video_views: s.video_views,
          video_watched_2s: s.video_watched_2s,
          video_watched_6s: s.video_watched_6s,
          video_view_p50: s.video_view_p50,
          video_view_p100: s.video_view_p100,
          likes: s.likes,
          comments: s.comments,
          shares: s.shares,
          follows: s.follows,
          updated_at: new Date().toISOString(),
        }));

        const { error: upsertErr } = await sb
          .from("tiktok_ads_rawdata")
          .upsert(batch, { onConflict: "advertiser_id,ad_id,stat_time_day" });

        if (upsertErr) {
          console.error("[tiktok/sync] upsert error:", upsertErr.message);
          // EC12: this is the app's highest-volume write, so it's the most
          // likely place a storage-exhaustion error would first surface —
          // not duplicated at every other (much smaller) upsert call site.
          if (looksLikeStorageError(upsertErr.message)) {
            await pauseSyncForStorage(sb, upsertErr.message);
          }
        } else {
          totalRows += batch.length;
        }
      }
    }
  } catch (err) {
    advError = formatTikTokError(err);
    console.error(`[tiktok/sync] advertiser ${adv.advertiser_id}:`, advError);
  }

  // ── Step 4: Fetch & store ad creatives (video thumbnails) ─────────────
  if (seenAdIds.size > 0) {
    try {
      // Spark Ad covers come from TikTok's public oEmbed endpoint one post at
      // a time, which is the slowest thing in this whole sync. Posts whose
      // cover is already stored are skipped — their image never changes, and
      // re-fetching them is what used to consume the entire time budget.
      const { data: storedCovers } = await sb
        .from("tiktok_ad_creatives")
        .select("tiktok_item_id")
        .eq("advertiser_id", adv.advertiser_id)
        .not("video_cover_url", "is", null)
        .not("tiktok_item_id", "is", null);
      const haveCoverItemIds = new Set(
        (storedCovers ?? []).map((r) => String(r.tiktok_item_id)).filter(Boolean),
      );

      const creatives = await fetchAdCreatives(adv.advertiser_id, [...seenAdIds], haveCoverItemIds);
      // Never let a row with nothing new to say overwrite a row that
      // previously had real data — a partially-failed fetch (rate limit,
      // transient error) returns every field empty, and unconditionally
      // upserting that would null out a thumbnail/link a past sync already
      // found. Only write rows that actually have something.
      const creativesWithData = creatives.filter(
        (c) => c.video_id || c.video_cover_url || c.caption || c.create_time || c.duration || c.tiktok_item_id,
      );
      const base = (c: (typeof creativesWithData)[number]) => ({
        ad_id: c.ad_id,
        advertiser_id: c.advertiser_id,
        video_id: c.video_id || null,
        caption: c.caption || null,
        create_time: c.create_time || null,
        duration: c.duration || null,
        tiktok_item_id: c.tiktok_item_id || null,
        updated_at: new Date().toISOString(),
      });

      // Written as two upserts, split on whether this run actually found a
      // cover, because a column left out of the payload keeps its stored
      // value while one set to null overwrites it — and the two must not be
      // mixed in a single request, where the column list is shared across
      // every row in the batch.
      //
      // The filter above only drops rows empty in EVERY field, and a Spark Ad
      // always carries tiktok_item_id, so rows whose cover lookup came back
      // empty passed it and then nulled out covers earlier syncs had found.
      // Covers could never accumulate: each run undid the last one's work.
      const withCover = creativesWithData.filter((c) => c.video_cover_url);
      const withoutCover = creativesWithData.filter((c) => !c.video_cover_url);

      const CBATCH = 200;
      for (let i = 0; i < withCover.length; i += CBATCH) {
        await sb.from("tiktok_ad_creatives").upsert(
          withCover.slice(i, i + CBATCH).map((c) => ({ ...base(c), video_cover_url: c.video_cover_url })),
          { onConflict: "ad_id" },
        );
      }
      for (let i = 0; i < withoutCover.length; i += CBATCH) {
        await sb.from("tiktok_ad_creatives").upsert(
          withoutCover.slice(i, i + CBATCH).map(base),
          { onConflict: "ad_id" },
        );
      }
    } catch (err) {
      console.error(`[tiktok/sync] creatives ${adv.advertiser_id}:`, formatTikTokError(err));
    }
  }

  // ── Step 6: Audience demographics (gender + age) ──────────────────────
  // Chunks fetched via Promise.all — safe even with many advertisers running
  // concurrently, since every underlying request funnels through the shared
  // rate gate in lib/tiktok-ads.ts (TikTok's real limit: 10 QPS app-wide).
  // "occupation" dropped — confirmed live via tiktok_error_log: TikTok
  // rejects it outright ("Invalid value for dimensions: occupation is not
  // supported."), on every chunk, for every advertiser. Each rejection
  // burned 3 retries + an alert email for data that was never coming.
  for (const dim of ["gender", "age"] as const) {
    try {
      const rows = (
        await Promise.all(
          chunks.map((c) =>
            fetchAudienceDemographics(adv.advertiser_id, c.start, c.end, dim).catch((err) => {
              console.error(`[tiktok/sync] audience/${dim} ${adv.advertiser_id} ${c.start}~${c.end}:`, formatTikTokError(err));
              return [];
            }),
          ),
        )
      ).flat();

      const ABATCH = 500;
      for (let i = 0; i < rows.length; i += ABATCH) {
        await sb.from("tiktok_audience_demographics").upsert(
          rows.slice(i, i + ABATCH).map((r) => ({
            advertiser_id: r.advertiser_id,
            stat_time_day: r.stat_time_day,
            dimension_type: r.dimension_type,
            dimension_value: r.dimension_value,
            spend: r.spend,
            impressions: r.impressions,
            reach: r.reach,
            video_views: r.video_views,
            likes: r.likes,
            clicks: r.clicks,
            video_watched_2s: r.video_watched_2s,
            video_watched_6s: r.video_watched_6s,
            video_views_p50: r.video_views_p50,
            video_views_p100: r.video_views_p100,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "advertiser_id,stat_time_day,dimension_type,dimension_value" },
        );
      }
    } catch (err) {
      console.error(`[tiktok/sync] audience/${dim} ${adv.advertiser_id}:`, formatTikTokError(err));
    }
  }

  // ── Step 7: Audience by province (TH) ──────────────────────────────────
  try {
    const rows = (
      await Promise.all(
        chunks.map((c) =>
          fetchAudienceLocations(adv.advertiser_id, c.start, c.end).catch((err) => {
            console.error(`[tiktok/sync] locations ${adv.advertiser_id} ${c.start}~${c.end}:`, formatTikTokError(err));
            return [];
          }),
        ),
      )
    ).flat();

    const LBATCH = 500;
    for (let i = 0; i < rows.length; i += LBATCH) {
      await sb.from("tiktok_audience_locations").upsert(
        rows.slice(i, i + LBATCH).map((r) => ({
          advertiser_id: r.advertiser_id,
          stat_time_day: r.stat_time_day,
          province_id: r.province_id,
          // province_name deliberately omitted here — see the backfill pass
          // in POST(). Setting it unconditionally on every sync meant an
          // empty regionNames map (any reason: not cached yet, a failed
          // lookup) would null out a name a past sync already found.
          spend: r.spend,
          impressions: r.impressions,
          reach: r.reach,
          video_views: r.video_views,
          likes: r.likes,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "advertiser_id,stat_time_day,province_id" },
      );
    }
  } catch (err) {
    console.error(`[tiktok/sync] locations ${adv.advertiser_id}:`, formatTikTokError(err));
  }

  // ── Step 8: Audience interests (doc: Interest Alignment) — best-effort,
  //    unverified endpoint, never blocks the rest of the sync (F13/doc).
  try {
    const rows = (
      await Promise.all(
        chunks.map((c) =>
          fetchAudienceInterests(adv.advertiser_id, c.start, c.end).catch((err) => {
            console.error(`[tiktok/sync] interests ${adv.advertiser_id} ${c.start}~${c.end}:`, formatTikTokError(err));
            return [];
          }),
        ),
      )
    ).flat();

    const IBATCH = 500;
    for (let i = 0; i < rows.length; i += IBATCH) {
      await sb.from("tiktok_audience_interests").upsert(
        rows.slice(i, i + IBATCH).map((r) => ({
          advertiser_id: r.advertiser_id,
          stat_time_day: r.stat_time_day,
          interest_category: r.interest_category,
          reach: r.reach,
          impressions: r.impressions,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "advertiser_id,stat_time_day,interest_category" },
      );
    }
  } catch (err) {
    console.error(`[tiktok/sync] interests ${adv.advertiser_id}:`, formatTikTokError(err));
  }

  // ── EC4: record which metrics this advertiser's token can't read ───────
  // Replaced wholesale (delete then insert) so a metric that gets
  // un-blocked on a later sync just stops appearing here — no manual
  // cleanup, no stale "still blocked" rows lingering forever.
  await sb.from("tiktok_metric_permissions").delete().eq("advertiser_id", adv.advertiser_id);
  if (droppedMetrics.size > 0) {
    await sb.from("tiktok_metric_permissions").insert(
      [...droppedMetrics].map((metric) => ({ advertiser_id: adv.advertiser_id, metric })),
    );
  }

  return {
    advertiser_id: adv.advertiser_id,
    advertiser_name: adv.advertiser_name,
    rows: totalRows,
    ...(advError ? { error: advError } : {}),
    startStr,
  };
}

export async function POST(req: Request) {
  const syncStartedAt = Date.now();
  const url = new URL(req.url);
  const triggeredBy = url.searchParams.get("source") ?? "manual";

  // Optional lookback override from the sync page's "3 เดือน / ทั้งหมด"
  // select — clamped to a sane range so a bad query param can't ask for
  // negative days or something absurd.
  const lookbackParam = Number(url.searchParams.get("lookback_days"));
  const lookbackOverride =
    Number.isFinite(lookbackParam) && lookbackParam > 0 && lookbackParam <= FIRST_SYNC_LOOKBACK_DAYS
      ? Math.floor(lookbackParam)
      : null;

  const sb = getSupabase();

  // EC12: storage-throttle switch — skip entirely, don't even start a log row.
  const pauseReason = await isSyncPaused(sb);
  if (pauseReason) {
    return NextResponse.json({ error: `Sync ถูกพักไว้ชั่วคราว: ${pauseReason}` }, { status: 503 });
  }

  // EC8: another sync already running (checked BEFORE creating this
  // attempt's own log row, or every request would see itself and lock).
  const running = await findRunningSync(sb);
  if (running) {
    return NextResponse.json({ error: "Sync กำลังดำเนินการอยู่ กรุณารอสักครู่..." }, { status: 409 });
  }

  const logId = await startSyncLog(triggeredBy, 0);
  setActiveSyncLogId(logId);

  // ── Step 1: Get all advertisers ────────────────────────────────────────────
  let advertisers: Awaited<ReturnType<typeof fetchAllAdvertisers>>;
  try {
    advertisers = await fetchAllAdvertisers();
  } catch (err) {
    const msg = `Failed to fetch advertisers: ${formatTikTokError(err)}`;
    await finishSyncLog(logId, "fail", 0, msg);
    await checkConsecutiveFailures();
    setActiveSyncLogId(null);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (advertisers.length === 0) {
    const msg = "No advertisers found for this access token";
    await finishSyncLog(logId, "fail", 0, msg);
    await checkConsecutiveFailures();
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  // ── Save/refresh advertiser list ──────────────────────────────────────────
  // F06: don't stomp an admin's is_active choice on every sync — only new
  // advertisers get inserted with is_active defaulted to true; known ones
  // just get their name refreshed.
  const { data: existingAdvRows } = await sb.from("tiktok_advertisers").select("advertiser_id, is_active");
  const knownIds = new Set((existingAdvRows ?? []).map((r) => r.advertiser_id));
  const activeIds = new Set(
    (existingAdvRows ?? []).filter((r) => r.is_active !== false).map((r) => r.advertiser_id),
  );

  const newAdvertisers = advertisers.filter((a) => !knownIds.has(a.advertiser_id));
  if (newAdvertisers.length > 0) {
    await sb.from("tiktok_advertisers").upsert(
      newAdvertisers.map((a) => ({
        advertiser_id: a.advertiser_id,
        advertiser_name: a.advertiser_name,
        is_active: true,
      })),
      { onConflict: "advertiser_id" },
    );
  }
  for (const a of advertisers.filter((a) => knownIds.has(a.advertiser_id))) {
    await sb.from("tiktok_advertisers").update({ advertiser_name: a.advertiser_name }).eq("advertiser_id", a.advertiser_id);
  }

  // F06: only sync accounts the admin has left active.
  const activeAdvertisers = advertisers.filter(
    (a) => !knownIds.has(a.advertiser_id) || activeIds.has(a.advertiser_id),
  );

  if (activeAdvertisers.length === 0) {
    await finishSyncLog(logId, "success", 0, "All connected advertisers are disabled in /tiktok/sync settings");
    setActiveSyncLogId(null);
    return NextResponse.json({ success: true, since: null, until: null, advertisers: [] });
  }

  // EC5/AC13: now that we know how many advertisers this run covers, record
  // it so /api/tiktok/status can show a completed/total progress bar.
  if (logId !== null) {
    await sb.from("tiktok_sync_log").update({ total_advertisers: activeAdvertisers.length }).eq("id", logId);
  }

  // ── Step 2–4: Loop each advertiser ────────────────────────────────────────
  const results: {
    advertiser_id: string;
    advertiser_name: string;
    rows: number;
    error?: string;
  }[] = [];

  // Yesterday in the ad account's timezone, not the server's — see lib/adDate.
  // Ads Manager's day boundary is the account's midnight, so this is what makes
  // the synced range line up with what TikTok shows on screen regardless of
  // when the cron fires.
  const endStr = daysAgoIn(1);

  let grandTotalRows = 0;
  let anyAdvertiserSucceeded = false;
  let earliestStartStr = endStr;

  // Region (province) id → name cache, reused for every advertiser's
  // province rows below.
  //
  // BUG FIX #1: this used to only ever call fetchRegionNames() once — the
  // very first time the cache table was completely empty — then never
  // again, permanently capping the cache at whatever partial set that one
  // call happened to return. Fixed by always fetching fresh and merging
  // (upsert, never delete) every sync.
  //
  // BUG FIX #2 (still showing gaps after fix #1 — live report): the fetch
  // only ever queried activeAdvertisers[0] — a single advertiser. TikTok's
  // /tool/region/ response is scoped to what's targetable/relevant for
  // THAT specific advertiser's account, not a universal list — with F06
  // supporting multiple ad accounts, a province that only shows up in
  // advertiser #2's audience data was never going to resolve no matter how
  // many times advertiser #1 alone got re-queried. Now queries every
  // active advertiser and merges all their results — still cheap, rides
  // the same shared rate gate as everything else in lib/tiktok-ads.ts.
  const regionNames = new Map<string, string>();
  const { data: cachedRegions } = await sb.from("tiktok_region_names").select("region_id, region_name");
  for (const r of cachedRegions ?? []) regionNames.set(r.region_id, r.region_name);

  const freshRegionResults = await Promise.all(
    activeAdvertisers.map((a) => fetchRegionNames(a.advertiser_id)),
  );
  const freshRegionNames = new Map<string, string>();
  for (const m of freshRegionResults) for (const [id, name] of m) freshRegionNames.set(id, name);
  if (freshRegionNames.size > 0) {
    for (const [id, name] of freshRegionNames) regionNames.set(id, name);
    await sb.from("tiktok_region_names").upsert(
      [...freshRegionNames.entries()].map(([region_id, region_name]) => ({ region_id, region_name })),
      { onConflict: "region_id" },
    );
  }

  // Same fix, same reasoning, for interest-category names (F12 Top
  // Interest) — see fetchInterestCategoryNames' unverified-endpoint caveat.
  // Unlike province_name (backfilled onto tiktok_audience_locations rows
  // below), category names are resolved at read time by the dashboard
  // route straight from this cache table — nothing else here needs the
  // fetched map, just get it into the cache.
  const freshInterestResults = await Promise.all(
    activeAdvertisers.map((a) => fetchInterestCategoryNames(a.advertiser_id)),
  );
  const freshInterestNames = new Map<string, string>();
  for (const m of freshInterestResults) for (const [id, name] of m) freshInterestNames.set(id, name);
  if (freshInterestNames.size > 0) {
    const { error: interestNameUpsertErr } = await sb.from("tiktok_interest_category_names").upsert(
      [...freshInterestNames.entries()].map(([category_id, category_name]) => ({ category_id, category_name })),
      { onConflict: "category_id" },
    );
    if (interestNameUpsertErr) console.error("[tiktok/sync] tiktok_interest_category_names upsert failed:", interestNameUpsertErr.message);
  }

  // Batches of ADVERTISER_CONCURRENCY run in parallel via Promise.all — no
  // extra pause needed between batches, the shared rate gate in
  // lib/tiktok-ads.ts already paces every underlying request safely.
  let stoppedEarlyForTimeBudget = false;
  for (let i = 0; i < activeAdvertisers.length; i += ADVERTISER_CONCURRENCY) {
    if (Date.now() - syncStartedAt > TIME_BUDGET_MS) {
      // EC5: don't start another batch this run — return what's done so
      // far as a normal (partial) response instead of risking Vercel's
      // hard kill mid-batch. Untouched advertisers just weren't synced
      // this run; next sync (24h cron, or another manual click) covers
      // them like any other incremental gap.
      stoppedEarlyForTimeBudget = true;
      break;
    }
    const batch = activeAdvertisers.slice(i, i + ADVERTISER_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((adv) => syncOneAdvertiser(sb, adv, endStr, lookbackOverride)),
    );

    for (const r of batchResults) {
      if (r.startStr < earliestStartStr) earliestStartStr = r.startStr;
      results.push({
        advertiser_id: r.advertiser_id,
        advertiser_name: r.advertiser_name,
        rows: r.rows,
        ...(r.error ? { error: r.error } : {}),
      });
      grandTotalRows += r.rows;
      if (!r.error) anyAdvertiserSucceeded = true;
    }
    await bumpCompletedCount(sb, logId, batchResults.length);
  }

  // Backfill province_name onto every still-unnamed row — including ones
  // just inserted this run (see the comment on the location upsert above:
  // it deliberately never writes province_name itself, only this safe,
  // targeted UPDATE does, so a bad/missing regionNames lookup can never
  // clobber a name a past sync already found).
  if (regionNames.size > 0) {
    const { count: unnamedCount } = await sb
      .from("tiktok_audience_locations")
      .select("id", { count: "exact", head: true })
      .is("province_name", null);
    if (unnamedCount) {
      for (const [regionId, regionName] of regionNames) {
        await sb
          .from("tiktok_audience_locations")
          .update({ province_name: regionName })
          .eq("province_id", regionId)
          .is("province_name", null);
      }
    }
  }

  // A sync "succeeds" if at least one advertiser came back clean — a single
  // account's API hiccup shouldn't mark the whole run (and F27's alert
  // counter) as a hard failure.
  const skippedCount = activeAdvertisers.length - results.length;
  const partialNote = stoppedEarlyForTimeBudget
    ? `หยุดก่อนครบเพราะใกล้ time limit ของ function — sync ${results.length}/${activeAdvertisers.length} advertiser แล้ว เหลืออีก ${skippedCount} จะ sync ต่อรอบถัดไปอัตโนมัติ`
    : null;

  if (anyAdvertiserSucceeded) {
    await finishSyncLog(logId, "success", grandTotalRows);
    if (partialNote) await sb.from("tiktok_sync_log").update({ status_detail: partialNote }).eq("id", logId);
    await checkTokenExpiryAndAlert(); // F04
  } else {
    const combinedError = results.map((r) => r.error).filter(Boolean).join(" | ") || "unknown error";
    await finishSyncLog(logId, "fail", grandTotalRows, combinedError);
    await checkConsecutiveFailures();
  }
  setActiveSyncLogId(null);

  return NextResponse.json({
    success: anyAdvertiserSucceeded,
    since: earliestStartStr,
    until: endStr,
    advertisers: results,
    ...(stoppedEarlyForTimeBudget ? { partial: true, note: partialNote } : {}),
  });
}
