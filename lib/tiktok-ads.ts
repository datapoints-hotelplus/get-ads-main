/**
 * lib/tiktok-ads.ts
 * TikTok Marketing API service (Business API v1.3)
 * Reads ACCESS_TOKEN, REFRESH_TOKEN, APP_ID, SECRET from environment variables.
 * Auto-refreshes the access token (error 40105) using TIKTOK_REFRESH_TOKEN.
 *
 * All GET calls go through tikTokGet(), which:
 *   - refreshes the token once on TikTok error 40105 (token expired)
 *   - retries up to 3x with exponential backoff on any other failure (F25)
 *   - logs every failed attempt to tiktok_error_log (F28)
 */

import axios, { AxiosError } from "axios";
import { getSupabase } from "@/lib/supabase";
import { getTikTokAccessToken, refreshTikTokAccessToken } from "@/lib/tiktok-token";
import { sendAlertEmail } from "@/lib/email";

const TIKTOK_ADS_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const PAGE_SIZE = 100;
// /report/integrated/get/'s real max page_size is 1000 (confirmed against
// TikTok's documented reporting limits — https://mixedanalytics.com/knowledge-base/import-tiktok-ads-data-to-google-sheets/,
// corroborated independently) — 10x fewer pages per call than PAGE_SIZE for
// the exact same data. Kept separate from PAGE_SIZE (used by /campaign/get/,
// /ad/get/, /advertiser/info/, ...) since those non-reporting list endpoints'
// max isn't confirmed — no reason to gamble on them when the real backfill
// slowness is entirely in the reporting calls below.
const REPORT_PAGE_SIZE = 1000;

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000; // 1s, 2s, 4s

// ─── Global rate gate ───────────────────────────────────────────────────────
// TikTok enforces a hard 10 QPS cap per app, shared across every advertiser
// and every endpoint (confirmed via a live error: "App ... reaches the QPS
// limit 10, current QPS is 11"). Tuning concurrency constants at each call
// site (how many advertisers run in parallel, delays between chunks, ...) is
// fragile and easy to get wrong — this is the root-cause fix instead: every
// single request funnels through here first, so no matter how many
// advertisers/chunks try to fire at once within this process, the actual
// request rate can't exceed MAX_QPS. Requests queue in call order and each
// just waits for its turn.
const MAX_QPS = 8; // stay under TikTok's 10 with margin
const MIN_INTERVAL_MS = 1000 / MAX_QPS;
let lastRequestAt = 0;
let rateGateQueue: Promise<void> = Promise.resolve();

function rateGate(): Promise<void> {
  const myTurn = rateGateQueue.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  // Chain the next caller onto this one regardless of outcome, so a request
  // that throws later doesn't stall everyone behind it in the queue.
  rateGateQueue = myTurn.catch(() => {});
  return myTurn;
}

function getAppCredentials(): { appId: string; secret: string } {
  const appId = process.env.TIKTOK_CLIENT_ID;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!appId) throw new Error("Missing TIKTOK_CLIENT_ID env variable");
  if (!secret) throw new Error("Missing TIKTOK_CLIENT_SECRET env variable");
  return { appId, secret };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Error helper ─────────────────────────────────────────────────────────────

function formatTikTokError(err: unknown): string {
  if (err instanceof AxiosError) {
    const d = err.response?.data;
    const raw = d ? JSON.stringify(d) : err.message;
    return `HTTP ${err.response?.status} — code:${d?.code} msg:${d?.message} | raw:${raw}`;
  }
  return err instanceof Error ? err.message : String(err);
}

class TikTokApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Error categorization (EC1/EC2/EC4) ────────────────────────────────────
// Best-effort string matching, same style as the existing `/40105|401|.../i`
// auth check in app/api/tiktok/status/route.ts — TikTok doesn't give a
// clean machine-readable "category" field, so this is a heuristic, not a
// guarantee. Never throws; unmatched errors just get category `null`
// (generic failure), which is exactly today's behavior.
export type TikTokErrorCategory = "rate_limit" | "field_error" | "permission_denied" | null;

export function categorizeTikTokError(err: unknown): TikTokErrorCategory {
  if (err instanceof AxiosError && err.response?.status === 429) return "rate_limit";
  const msg = err instanceof Error ? err.message : String(err);
  if (/permission_denied|no permission|not authorized to access/i.test(msg)) return "permission_denied";
  if (/invalid.*(field|dimension|metric)|not support(ed)?|does not exist|unknown (field|metric|dimension)|deprecated/i.test(msg))
    return "field_error";
  return null;
}

// Best-effort pointer to the sync_log row currently running, set once at the
// top of POST /api/tiktok/sync — lets tikTokGet() surface a live "what's
// happening right now" line (EC1 rate-limit wait, EC2 field-error banner)
// without threading a log id through every fetch* function's signature.
// Only meaningful within one serverless invocation; harmless if unset.
let activeSyncLogId: number | null = null;
export function setActiveSyncLogId(id: number | null) {
  activeSyncLogId = id;
}
export async function setStatusDetail(text: string) {
  if (activeSyncLogId === null) return;
  try {
    await getSupabase().from("tiktok_sync_log").update({ status_detail: text }).eq("id", activeSyncLogId);
  } catch {
    // best-effort — never blocks the sync
  }
}

// Logging a failure must never itself break a sync (best-effort, swallow errors).
async function logApiFailure(endpoint: string, httpStatus: number | null, message: string, category: TikTokErrorCategory) {
  try {
    const sb = getSupabase();
    await sb.from("tiktok_error_log").insert({
      endpoint,
      http_status: httpStatus,
      error_message: message.slice(0, 2000),
      error_category: category,
    });
  } catch {
    // ignore — logging is best-effort
  }
}

/**
 * GET wrapper shared by every fetch* function below.
 *  - `endpoint` is the path after TIKTOK_ADS_BASE, used as the log label.
 *  - Refreshes the token once on code 40105 (doesn't count against retry budget).
 *  - Retries up to RETRY_ATTEMPTS times with exponential backoff on any other
 *    failure (network error, non-2xx, or TikTok error code).
 */
interface TikTokApiResponse {
  code: number;
  message: string;
  // TikTok's response shape varies per endpoint (different `list` row
  // shapes) — each fetch* function below casts `.data.list` to what that
  // endpoint actually returns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

// EC1: TikTok's rate-limit response asks for a real cooldown, not the usual
// quick 1/2/4s backoff — 60s is the low end of the TOR's 60-300s range, kept
// fixed (not randomized) to stay simple and to not eat too much of the
// sync route's 300s function budget on repeated hits.
const RATE_LIMIT_COOLDOWN_MS = 60_000;

async function tikTokGet(
  endpoint: string,
  params: Record<string, unknown>,
): Promise<TikTokApiResponse> {
  let token = await getTikTokAccessToken();
  let didRefresh = false;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < RETRY_ATTEMPTS) {
    try {
      await rateGate();
      const res = await axios.get(`${TIKTOK_ADS_BASE}${endpoint}`, {
        headers: { "Access-Token": token, "Content-Type": "application/json" },
        params,
      });
      const body = res.data;

      if (body.code === 40105 && !didRefresh) {
        didRefresh = true;
        token = (await refreshTikTokAccessToken()).access_token;
        continue; // free retry — token was the problem, not the network
      }
      if (body.code !== 0) {
        throw new TikTokApiError(body.code, body.message ?? "unknown TikTok error");
      }
      return body;
    } catch (err) {
      lastError = err;
      const httpStatus = err instanceof AxiosError ? (err.response?.status ?? null) : null;
      const category = categorizeTikTokError(err);
      const message = formatTikTokError(err);
      await logApiFailure(endpoint, httpStatus, message, category);

      // EC2: an endpoint/field TikTok no longer recognizes is a policy
      // change, not a transient hiccup — surface it immediately (banner +
      // email) instead of waiting for F27's "2 syncs in a row" threshold.
      if (category === "field_error") {
        await setStatusDetail(`Sync error: field ไม่พบ (${endpoint})`);
        await sendAlertEmail(
          `[TikTok Ads] Sync error: field ไม่พบที่ ${endpoint}`,
          `<p>TikTok ปฏิเสธ field/dimension ที่เคยใช้ได้ที่ endpoint <code>${endpoint}</code> — อาจเป็นเพราะ TikTok เปลี่ยน API โดยไม่แจ้งล่วงหน้า</p><p>รายละเอียด: ${message}</p>`,
        );
      }

      attempt += 1;
      if (attempt < RETRY_ATTEMPTS) {
        if (category === "rate_limit") {
          await setStatusDetail(`TikTok rate limit ที่ ${endpoint} — กำลังรอ ${RATE_LIMIT_COOLDOWN_MS / 1000}s แล้วลองใหม่...`);
          await sleep(RATE_LIMIT_COOLDOWN_MS);
        } else {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
        }
      }
    }
  }
  throw lastError;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TikTokAdvertiser {
  advertiser_id: string;
  advertiser_name: string;
}

export interface TikTokAdStat {
  advertiser_id: string;
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adgroup_id: string;
  adgroup_name: string;
  stat_time_day: string; // "YYYY-MM-DD"
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  cpm: number;
  cpc: number;
  average_video_play: number; // avg watch time (seconds)
  video_views: number;
  video_watched_2s: number;
  video_watched_6s: number;
  video_view_p50: number;
  video_view_p100: number;
  likes: number;
  comments: number;
  shares: number;
  follows: number;
}

export interface TikTokAudienceRow {
  advertiser_id: string;
  stat_time_day: string;
  dimension_type: "gender" | "age" | "occupation";
  dimension_value: string;
  spend: number;
  impressions: number;
  reach: number;
  video_views: number;
  likes: number;
  clicks: number;
  video_watched_2s: number;
  video_watched_6s: number;
  video_views_p50: number;
  video_views_p100: number;
}

export interface TikTokLocationRow {
  advertiser_id: string;
  stat_time_day: string;
  province_id: string;
  province_name: string;
  spend: number;
  impressions: number;
  reach: number;
  video_views: number;
  likes: number;
}

export interface TikTokCampaignInfo {
  campaign_id: string;
  advertiser_id: string;
  campaign_name: string;
  objective_type: string;
}

// ─── Get all advertisers the token has access to ──────────────────────────────
// Strategy:
//   1. If TIKTOK_ADVERTISER_IDS is set in env (comma-separated) →
//      call /advertiser/info/ with the token only (no app_id/secret needed).
//   2. Otherwise fall back to /oauth2/advertiser/get/ which requires
//      app_id + secret to auto-discover which advertisers the token owns.

export async function fetchAllAdvertisers(): Promise<TikTokAdvertiser[]> {
  // ── Strategy 1: IDs already known ─────────────────────────────────────
  const rawIds = process.env.TIKTOK_ADVERTISER_IDS;
  if (rawIds) {
    const ids = rawIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const body = await tikTokGet("/advertiser/info/", {
      advertiser_ids: JSON.stringify(ids),
    });

    const list: { advertiser_id: string; name: string }[] =
      body.data?.list ?? [];
    return list.map((item) => ({
      advertiser_id: String(item.advertiser_id),
      advertiser_name: item.name,
    }));
  }

  // ── Strategy 2: Auto-discover via oauth2/advertiser/get/ ──────────────
  const { appId, secret } = getAppCredentials();
  const results: TikTokAdvertiser[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const body = await tikTokGet("/oauth2/advertiser/get/", {
      app_id: appId,
      secret,
      page,
      page_size: PAGE_SIZE,
    });

    const list: { advertiser_id: string; advertiser_name: string }[] =
      body.data?.list ?? [];
    for (const item of list) {
      results.push({
        advertiser_id: String(item.advertiser_id),
        advertiser_name: item.advertiser_name,
      });
    }

    const pageInfo = body.data?.page_info;
    totalPages = pageInfo?.total_page ?? 1;
    page += 1;

  } while (page <= totalPages);

  return results;
}

// ─── Fetch ad-level insights for one advertiser, paginated ───────────────────

// EC4: spend/impressions are the two metrics the whole app is meaningless
// without — never dropped even if TikTok returns permission_denied for
// everything else. Every other requested metric is negotiable.
const CORE_AD_METRICS = ["spend", "impressions"];

export async function fetchAdInsights(
  advertiserId: string,
  advertiserName: string,
  startDate: string, // "YYYY-MM-DD"
  endDate: string, // "YYYY-MM-DD"
): Promise<{ rows: TikTokAdStat[]; droppedMetrics: string[] }> {
  const results: TikTokAdStat[] = [];

  let metrics = [
    // ad_name/campaign_id/campaign_name/adgroup_id/adgroup_name are read
    // off every row below (see `m.campaign_name` etc.) but TikTok only
    // includes a metric in the response if it's actually requested here —
    // these were missing from this list, so all 5 came back undefined on
    // every row (confirmed live: 100% null in tiktok_ads_rawdata), and the
    // Campaign/Ad Group filters on the dashboard had nothing to populate.
    "ad_name",
    "campaign_id",
    "campaign_name",
    "adgroup_id",
    "adgroup_name",
    "spend",
    "impressions",
    "reach",
    // "clicks" is TikTok's "Clicks (destination)" — clicks that go to a
    // specified destination (link, deep link, store). Confirmed live: this
    // account's campaigns (REACH/VIDEO_VIEW/ENGAGEMENT objectives, no
    // destination) return 0 for every row. "engagements" is TikTok's
    // "Clicks (all)" — destination clicks plus social/interaction clicks
    // (sound, duet, stitch, profile, ...) — and is what actually has data
    // here. Stored in the same `clicks` column/field throughout the app;
    // only the source metric changed.
    "engagements",
    "cpm",
    "cpc",
    "average_video_play",
    "video_play_actions",
    "video_watched_2s",
    "video_watched_6s",
    "video_views_p50",
    "video_views_p100",
    "likes",
    "comments",
    "shares",
    "follows",
  ];
  // EC4: which non-core metrics got dropped after a permission_denied — kept
  // even after a retry succeeds, since the report is still missing that data
  // for the whole date range regardless of which page tripped it.
  let droppedMetrics: string[] = [];

  const dimensions = ["ad_id", "stat_time_day"];

  let page = 1;
  let totalPages = 1;

  do {
    let body;
    try {
      body = await tikTokGet("/report/integrated/get/", {
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_AD",
        dimensions: JSON.stringify(dimensions),
        metrics: JSON.stringify(metrics),
        start_date: startDate,
        end_date: endDate,
        page,
        page_size: REPORT_PAGE_SIZE,
      });
    } catch (err) {
      // EC4: TikTok's reporting API fails the *whole* metrics list when any
      // one field isn't permitted (same trap the clicks/ad_text bonus fields
      // hit elsewhere in this file) — can't tell which metric was the
      // problem without bisecting per-metric API calls, so the pragmatic
      // move is: drop everything but the two metrics the app can't run
      // without, retry once, and record every dropped metric as "blocked"
      // rather than silently zero.
      if (categorizeTikTokError(err) === "permission_denied" && metrics.length > CORE_AD_METRICS.length) {
        droppedMetrics = metrics.filter((m) => !CORE_AD_METRICS.includes(m));
        metrics = [...CORE_AD_METRICS];
        continue;
      }
      throw err;
    }

    const list: {
      dimensions: Record<string, string>;
      metrics: Record<string, string>;
    }[] = body.data?.list ?? [];

    for (const row of list) {
      const dim = row.dimensions;
      const m = row.metrics;

      results.push({
        advertiser_id: advertiserId,
        ad_id: dim.ad_id ?? "",
        ad_name: m.ad_name ?? "",
        campaign_id: m.campaign_id ?? "",
        campaign_name: m.campaign_name ?? "",
        adgroup_id: m.adgroup_id ?? "",
        adgroup_name: m.adgroup_name ?? "",
        stat_time_day: dim.stat_time_day?.slice(0, 10) ?? "",
        spend: num(m.spend),
        impressions: num(m.impressions),
        reach: num(m.reach),
        clicks: num(m.engagements), // "Clicks (all)" — see the metrics list comment above
        cpm: num(m.cpm),
        cpc: num(m.cpc),
        average_video_play: num(m.average_video_play),
        video_views: num(m.video_play_actions),
        video_watched_2s: num(m.video_watched_2s),
        video_watched_6s: num(m.video_watched_6s),
        video_view_p50: num(m.video_views_p50),
        video_view_p100: num(m.video_views_p100),
        likes: num(m.likes),
        comments: num(m.comments),
        shares: num(m.shares),
        follows: num(m.follows),
      });
    }

    const pageInfo = body.data?.page_info;
    totalPages = pageInfo?.total_page ?? 1;
    page += 1;

  } while (page <= totalPages);

  return { rows: results, droppedMetrics };
}

// ─── Deduplicated reach for a date range ─────────────────────────────────────
//
// reach counts PEOPLE, not events, so unlike every other metric in this file
// it cannot be summed. The rows in tiktok_ads_rawdata are per-ad per-day and
// count the same person once for every ad they saw on every day they saw it
// — adding those up drifts toward impressions, not reach. Only TikTok can
// deduplicate, and only when asked for the whole range in one call, which
// means NOT requesting stat_time_day (the same thing that lifts the report's
// 30-day cap to 365 — see CHUNK_DAYS in app/api/tiktok/sync/route.ts).
//
// Still one call per advertiser: the reporting API takes a single
// advertiser_id, and TikTok can't dedupe one person across two ad accounts
// anyway, so summing the per-advertiser figures is as close as this gets.
// That residual overlap only exists for viewers who saw ads from more than
// one of these accounts.
export async function fetchDedupedReach(
  advertiserIds: string[],
  startDate: string,
  endDate: string,
): Promise<number> {
  const perAdvertiser = await Promise.all(
    advertiserIds.map(async (advertiserId) => {
      const body = await tikTokGet("/report/integrated/get/", {
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_ADVERTISER",
        dimensions: JSON.stringify(["advertiser_id"]),
        metrics: JSON.stringify(["reach"]),
        start_date: startDate,
        end_date: endDate,
        page: 1,
        page_size: REPORT_PAGE_SIZE,
      });
      const list: { metrics?: Record<string, string> }[] = body.data?.list ?? [];
      return list.reduce((sum, row) => sum + num(row.metrics?.reach), 0);
    }),
  );
  return perAdvertiser.reduce((a, b) => a + b, 0);
}

// ─── Fetch deduplicated reach PER AD, same technique, ad-table granularity ──
// The Ad Detail table's reach came from summing tiktok_ads_rawdata's
// per-ad-per-day rows — the exact "reach can't be summed" mistake the
// account-level figure above was built to avoid, just one level down. An ad
// that ran for a month and was seen by the same 10,000 people all 30 days
// summed to 300,000; TikTok's own number for that ad over the whole month is
// 10,000. Confirmed live: a single ad's per-ad-per-day sum came out at 211.9K
// against TikTok's own monthly reach of 163,146 for that same ad.
//
// Same fix as fetchDedupedReach, dimensioned by ad_id instead of
// advertiser_id — one call per advertiser returns every one of its ads'
// deduped reach for the range in a single response, so this costs no more
// requests than the account-level fetch already makes.
export async function fetchDedupedReachByAd(
  advertiserIds: string[],
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  await Promise.all(
    advertiserIds.map(async (advertiserId) => {
      const body = await tikTokGet("/report/integrated/get/", {
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_AD",
        dimensions: JSON.stringify(["ad_id"]),
        metrics: JSON.stringify(["reach"]),
        start_date: startDate,
        end_date: endDate,
        page: 1,
        page_size: REPORT_PAGE_SIZE,
      });
      const list: { dimensions?: Record<string, string>; metrics?: Record<string, string> }[] = body.data?.list ?? [];
      for (const row of list) {
        const adId = row.dimensions?.ad_id;
        if (adId) result.set(adId, num(row.metrics?.reach));
      }
    }),
  );
  return result;
}

/**
 * Overwrites each row's `reach` in place with TikTok's own deduped figure for
 * that ad over the exact range, where available. Best-effort and silent on
 * failure — an ad missing from the live response, or the whole call failing,
 * just leaves that row's summed (inflated) reach untouched rather than
 * blocking the table or the CSV export over one API hiccup.
 */
export async function applyDedupedReachToAds<T extends { ad_id: string; reach: number }>(
  ads: T[],
  advertiserIds: string[],
  startDate: string,
  endDate: string,
): Promise<void> {
  try {
    const live = await fetchDedupedReachByAd(advertiserIds, startDate, endDate);
    for (const ad of ads) {
      const reach = live.get(ad.ad_id);
      if (reach !== undefined) ad.reach = reach;
    }
  } catch (err) {
    console.error("[tiktok-ads] applyDedupedReachToAds failed, per-ad reach stays summed (non-fatal):", formatTikTokError(err));
  }
}

// ─── Fetch audience demographics (gender / age) for one advertiser ──────────
//
// Uses /report/integrated/get/ with report_type=AUDIENCE and a single
// audience dimension. Aggregated by stat_time_day for daily granularity.

export async function fetchAudienceDemographics(
  advertiserId: string,
  startDate: string,
  endDate: string,
  // F12: "occupation" reuses this exact same shape (one categorical
  // profile-trait dimension + stat_time_day) instead of a copy-pasted
  // function — TikTok's AUDIENCE report treats it the same way it treats
  // gender/age. ⚠ UNVERIFIED: unlike gender/age this hasn't been confirmed
  // against a live account — if TikTok rejects the dimension name
  // "occupation" outright, the caller's try/catch in the sync route just
  // leaves this data out (same as the interest_category/interests fallback),
  // nothing else breaks. Try the alternate name "job" if "occupation" 404s.
  dimensionType: "gender" | "age" | "occupation",
): Promise<TikTokAudienceRow[]> {
  const results: TikTokAudienceRow[] = [];

  // BONUS_METRICS are best-effort extras: "engagements" powers the Age
  // breakdown's CTR/CPC columns, and the four watch-depth counts power its
  // 2s/6s/50%/100% rate columns. TikTok fails the *whole* metrics list if it
  // rejects any one of them (same trap as fetchAdCreatives' ad_text/
  // create_time), which would take the previously-working gender/age charts
  // down with it. Drop the whole bonus set and retry once before giving up.
  //
  // All five were confirmed live against report_type=AUDIENCE + the `age`
  // dimension (2026-09-08) — the fallback is belt-and-braces for a future
  // TikTok permission change, not an expected path.
  //
  // "engagements" ("Clicks (all)"), not "clicks" ("Clicks (destination)") —
  // same switch as fetchAdInsights above, for the same reason: this
  // account's objectives have no destination, so "clicks" is 0 across the
  // board while "engagements" actually has data.
  const BONUS_METRICS = ["engagements", "video_watched_2s", "video_watched_6s", "video_views_p50", "video_views_p100"];
  let metrics = ["spend", "impressions", "reach", "video_play_actions", "likes", ...BONUS_METRICS];
  const dimensions = ["stat_time_day", dimensionType];

  let page = 1;
  let totalPages = 1;

  do {
    let body;
    try {
      body = await tikTokGet("/report/integrated/get/", {
        advertiser_id: advertiserId,
        report_type: "AUDIENCE",
        data_level: "AUCTION_AD",
        dimensions: JSON.stringify(dimensions),
        metrics: JSON.stringify(metrics),
        start_date: startDate,
        end_date: endDate,
        page,
        page_size: REPORT_PAGE_SIZE,
      });
    } catch (err) {
      if (metrics.some((m) => BONUS_METRICS.includes(m))) {
        metrics = metrics.filter((m) => !BONUS_METRICS.includes(m));
        continue; // retry this same page without the bonus metrics
      }
      throw err; // already on the safe metric set — a real failure, let the caller handle it
    }

    const list: {
      dimensions: Record<string, string>;
      metrics: Record<string, string>;
    }[] = body.data?.list ?? [];

    for (const row of list) {
      const dim = row.dimensions;
      const m = row.metrics;
      const dimValue = String(dim[dimensionType] ?? "");
      if (!dimValue) continue;

      results.push({
        advertiser_id: advertiserId,
        stat_time_day: dim.stat_time_day?.slice(0, 10) ?? "",
        dimension_type: dimensionType,
        dimension_value: dimValue,
        spend: num(m.spend),
        impressions: num(m.impressions),
        reach: num(m.reach),
        video_views: num(m.video_play_actions),
        likes: num(m.likes),
        clicks: num(m.engagements), // "Clicks (all)" — see BONUS_METRICS comment above
        video_watched_2s: num(m.video_watched_2s),
        video_watched_6s: num(m.video_watched_6s),
        video_views_p50: num(m.video_views_p50),
        video_views_p100: num(m.video_views_p100),
      });
    }

    const pageInfo = body.data?.page_info;
    totalPages = pageInfo?.total_page ?? 1;
    page += 1;

  } while (page <= totalPages);

  return results;
}

// ─── Fetch audience by province (Thailand) ──────────────────────────────────
//
// TikTok returns province_id as a numeric code; province_name comes from a
// dimension `dma_id` or `province` depending on the API version. We request
// `province_id` and rely on the front-end map to translate IDs → names.

export async function fetchAudienceLocations(
  advertiserId: string,
  startDate: string,
  endDate: string,
): Promise<TikTokLocationRow[]> {
  const results: TikTokLocationRow[] = [];

  const metrics = ["spend", "impressions", "reach", "video_play_actions", "likes"];
  const dimensions = ["stat_time_day", "province_id"];

  const baseParams = {
    advertiser_id: advertiserId,
    report_type: "AUDIENCE",
    data_level: "AUCTION_AD",
    dimensions: JSON.stringify(dimensions),
    metrics: JSON.stringify(metrics),
    start_date: startDate,
    end_date: endDate,
    page_size: REPORT_PAGE_SIZE,
  };

  // No country_code filter. It used to be sent first and dropped after the
  // first page failed, but TikTok rejects it outright — "Invalid value for
  // filter field: country_code is not supported" — for every advertiser, on
  // every chunk, every sync. The retry-then-drop dance therefore never once
  // saved a request; it cost three (tikTokGet's retry budget) plus their
  // backoff, three tiktok_error_log rows, and three field-change alert
  // emails per chunk, and it is what puts "Sync error: field ไม่พบ" on the
  // dashboard after a clean sync.
  //
  // Dropping the filter loses nothing: this account advertises only in TH,
  // and the province_id dimension already restricts the rows to whatever
  // regions the ads actually reached.

  let page = 1;
  let totalPages = 1;

  do {
    const body = await tikTokGet("/report/integrated/get/", {
      ...baseParams,
      page,
    });

    const list: {
      dimensions: Record<string, string>;
      metrics: Record<string, string>;
    }[] = body.data?.list ?? [];

    for (const row of list) {
      const dim = row.dimensions;
      const m = row.metrics;
      const provinceId = String(dim.province_id ?? "");
      if (!provinceId) continue;
      results.push({
        advertiser_id: advertiserId,
        stat_time_day: dim.stat_time_day?.slice(0, 10) ?? "",
        province_id: provinceId,
        province_name: String(dim.province_name ?? ""),
        spend: num(m.spend),
        impressions: num(m.impressions),
        reach: num(m.reach),
        video_views: num(m.video_play_actions),
        likes: num(m.likes),
      });
    }

    const pageInfo = body.data?.page_info;
    totalPages = pageInfo?.total_page ?? 1;
    page += 1;

  } while (page <= totalPages);

  return results;
}

// ─── Fetch business account profile snapshot (F15 — see app/api/tiktok/sync-profile/route.ts's file comment: unverified) ──
export async function fetchBusinessProfile(
  businessId: string,
): Promise<{ followers_count: number; likes_count: number; videos_count: number }> {
  const body = await tikTokGet("/business/get/", {
    business_id: businessId,
    fields: JSON.stringify(["followers_count", "likes_count", "videos_count"]),
  });
  const d = body.data ?? {};
  return {
    followers_count: d.followers_count ?? 0,
    likes_count: d.likes_count ?? 0,
    videos_count: d.videos_count ?? 0,
  };
}

// ═══ Accounts API (NOT the Marketing/Ads API) ════════════════════════════════
// Everything else in this file talks to TikTok's Marketing/Ads API. The
// section below talks to the *Accounts API* — a separate product surface that
// must be enabled on the TikTok app in the developer portal and re-authorized
// (the token minted by the current ads_management/reporting_service scopes in
// lib/tiktok-token.ts does not carry it). Until that's done every call here
// comes back permission_denied, which the sync route reports as a failure
// rather than writing zeros.
//
// ⚠ No live Accounts-API call has been made from this codebase yet, so the
// response shapes below are TikTok's documented ones, not confirmed ones.
// Every parser dumps the raw response into tiktok_error_log when it can't
// find what it expected instead of silently returning nothing — same
// self-diagnosing pattern as fetchInterestCategoryNames above, so the first
// real run tells us the true shape instead of just failing quietly.

export interface TikTokBusinessAccount {
  business_id: string;
  bc_id: string;
  username: string;
  display_name: string;
  profile_image: string;
}

// Raw asset rows from the most recent fetchBusinessAccounts() call, for
// diagnosing which field actually carries the business id. Module-level
// rather than part of the return type so callers that don't care are
// unaffected; only meaningful immediately after that call.
let lastDiscoveryRaw: Record<string, unknown>[] = [];
export function getLastDiscoveryRaw(): Record<string, unknown>[] {
  return lastDiscoveryRaw;
}

// Confirmed live: the /bc/ endpoints cap page_size at 50, not the 100 the
// Marketing API's list endpoints accept ("page_size: number must be most
// 50"). Separate constant rather than lowering PAGE_SIZE, which is fine as
// it is everywhere else.
const BC_PAGE_SIZE = 50;

/**
 * Discover every business account this token can read:
 * /bc/get/ (Business Centers) → /bc/asset/get/ (assets of type
 * MANAGED_BUSINESS_ACCOUNT). This is what makes the hard-coded
 * TIKTOK_BUSINESS_ID env of the older F15 route unnecessary — see the header
 * of 036_tiktok_organic.sql.
 */
export async function fetchBusinessAccounts(): Promise<TikTokBusinessAccount[]> {
  const accounts: TikTokBusinessAccount[] = [];
  // Every asset row TikTok returned, untouched. The id below is picked out of
  // whichever field is present, which is a guess until someone has seen a real
  // response — and picking the wrong field yields an id that /business/get/
  // rejects with an auth-shaped error rather than "no such account", so the
  // raw rows are worth carrying back to the caller.
  lastDiscoveryRaw = [];

  const bcBody = await tikTokGet("/bc/get/", { page: 1, page_size: BC_PAGE_SIZE });
  const bcList: { bc_info?: { bc_id?: string } }[] = bcBody.data?.list ?? [];
  if (bcList.length === 0) {
    await logApiFailure("/bc/get/ (diag: 0 business centers, raw response below)", null, JSON.stringify(bcBody.data).slice(0, 1900), null);
    return accounts;
  }

  for (const bc of bcList) {
    const bcId = bc.bc_info?.bc_id;
    if (!bcId) continue;

    let page = 1;
    let totalPages = 1;
    do {
      const body = await tikTokGet("/bc/asset/get/", {
        bc_id: bcId,
        asset_type: "MANAGED_BUSINESS_ACCOUNT",
        page,
        page_size: BC_PAGE_SIZE,
      });
      const list: Record<string, unknown>[] = body.data?.list ?? [];
      if (list.length === 0 && page === 1) {
        await logApiFailure(
          `/bc/asset/get/ (diag: 0 business accounts for bc ${bcId}, raw response below)`,
          null,
          JSON.stringify(body.data).slice(0, 1900),
          null,
        );
      }
      for (const item of list) {
        lastDiscoveryRaw.push(item);
        // TikTok names the id field differently per asset_type — take
        // whichever one the response actually carries rather than betting on
        // a single guess and getting zero accounts if it's the other.
        const id = item.business_id ?? item.asset_id ?? item.id;
        if (!id) continue;
        accounts.push({
          business_id: String(id),
          bc_id: bcId,
          username: String(item.username ?? ""),
          display_name: String(item.display_name ?? item.name ?? ""),
          profile_image: String(item.profile_image ?? ""),
        });
      }
      totalPages = body.data?.page_info?.total_page ?? 1;
      page += 1;
    } while (page <= totalPages);
  }

  return accounts;
}

export interface TikTokAccountDayStat {
  stat_time_day: string;
  video_views: number;
  profile_views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  followers_count: number;
}

// The two metrics this whole feature exists for — never dropped. Everything
// else is a bonus that gets dropped if TikTok rejects the field list as a
// whole (same all-or-nothing trap, and same fix, as CORE_AD_METRICS above).
const CORE_ACCOUNT_FIELDS = ["followers_count", "profile_views"];

/**
 * /business/get/ with a date range returns its per-day numbers in one of a
 * few shapes depending on endpoint version. Rather than bet on one and get
 * zero rows if it's another, normalize all of them to an array of per-day
 * objects; the caller's diagnostic dump fires only if none matched.
 */
function parseDailyMetricRows(data: unknown): Record<string, unknown>[] {
  const d = data as Record<string, unknown> | null | undefined;
  const metrics = d?.metrics;
  if (Array.isArray(metrics)) return metrics as Record<string, unknown>[];
  if (Array.isArray(d?.list)) return d?.list as Record<string, unknown>[];

  // Column-oriented shape: { date: [...], profile_views: [...], ... } —
  // transpose into one object per day.
  const m = metrics as Record<string, unknown> | undefined;
  if (m && typeof m === "object") {
    const dates = (m.date ?? m.stat_time_day) as unknown[] | undefined;
    if (Array.isArray(dates)) {
      return dates.map((day, i) => {
        const row: Record<string, unknown> = { date: day };
        for (const [key, value] of Object.entries(m)) {
          if (Array.isArray(value)) row[key] = value[i];
        }
        return row;
      });
    }
  }
  return [];
}

/**
 * Account-level daily metrics (profile views, followers, engagement) for one
 * business account. Values are paid + organic combined — see the header of
 * 036_tiktok_organic.sql. Returns rows sorted oldest-first; `new_followers`
 * is NOT computed here (it needs the day before the range as a baseline —
 * the sync route does that).
 */
export async function fetchAccountDailyMetrics(
  businessId: string,
  startDate: string,
  endDate: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ rows: TikTokAccountDayStat[]; droppedFields: string[]; raw: any }> {
  const bonusFields = ["video_views", "reach", "likes", "comments", "shares"];
  const get = (fields: string[]) =>
    tikTokGet("/business/get/", {
      business_id: businessId,
      fields: JSON.stringify(fields),
      start_date: startDate,
      end_date: endDate,
    });

  let droppedFields: string[] = [];
  let body: TikTokApiResponse;
  try {
    body = await get([...CORE_ACCOUNT_FIELDS, ...bonusFields]);
  } catch (err) {
    const category = categorizeTikTokError(err);
    if (category !== "permission_denied" && category !== "field_error") throw err;
    // TikTok fails the *entire* field list when any single field isn't
    // permitted or recognized — there's no way to tell which one without
    // bisecting, so retry with just the two the feature needs and record the
    // rest as blocked rather than letting them read as a real zero.
    droppedFields = bonusFields;
    body = await get(CORE_ACCOUNT_FIELDS);
  }

  const raw = parseDailyMetricRows(body.data);
  if (raw.length === 0) {
    await logApiFailure(
      `/business/get/ (diag: 0 daily rows for ${businessId} ${startDate}~${endDate}, raw response below)`,
      null,
      JSON.stringify(body.data).slice(0, 1900),
      null,
    );
  }

  const rows = raw
    .map((r) => ({
      stat_time_day: String(r.date ?? r.stat_time_day ?? "").slice(0, 10),
      video_views: num(r.video_views),
      profile_views: num(r.profile_views),
      reach: num(r.reach),
      likes: num(r.likes),
      comments: num(r.comments),
      shares: num(r.shares),
      followers_count: num(r.followers_count),
    }))
    .filter((r) => r.stat_time_day)
    .sort((a, b) => a.stat_time_day.localeCompare(b.stat_time_day));

  // `raw` is TikTok's own response body, returned as-is: the response shapes
  // here are documented rather than confirmed, so a caller that gets zero
  // rows needs to see what actually came back to tell "TikTok has no data for
  // this account" apart from "the parser above looked in the wrong place".
  return { rows, droppedFields, raw: body.data };
}

// ─── Fetch region names (province_id → Thai name) ─────────────────────────────
// ⚠ UNVERIFIED — best guess at TikTok's targeting/location lookup endpoint
// (used for ad-targeting location search, not the reporting API). The
// AUDIENCE report's province_id dimension doesn't come with a name attached,
// so this is the only way to label the province table/map with anything
// other than a raw numeric code. Never throws — on any failure/shape
// mismatch it just returns an empty map, and callers fall back to showing
// the code, exactly like before this existed.
export async function fetchRegionNames(advertiserId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const body = await tikTokGet("/tool/region/", {
      advertiser_id: advertiserId,
      placements: JSON.stringify(["PLACEMENT_TIKTOK"]),
      objective_type: "REACH",
      // BUG FIX (confirmed against TikTok's official ToolApi docs — this
      // param was missing entirely): `level_range` controls how deep the
      // returned location tree goes (ALL/TO_COUNTRY/TO_PROVINCE/TO_CITY/
      // TO_DISTRICT). Without it, TikTok was silently defaulting to
      // whatever narrower scope it picks on its own — matching the live
      // symptom exactly (only ~33 of ~77 Thai provinces ever came back, no
      // matter how many advertisers/times this was called). TO_PROVINCE
      // asks for country+province levels directly — the two levels this
      // app actually uses (province_id dimension) — without pulling in
      // city/district data nobody reads.
      level_range: "TO_PROVINCE",
    });
    // Confirmed shape (2026-08-19): data.region_info is a FLAT list covering
    // every level (COUNTRY/PROVINCE/...) at once — location_id is the id our
    // AUDIENCE report's province_id matches, name is the label. No nesting
    // to walk; next_level_ids just cross-references other ids in this same
    // array, which are already covered by iterating the whole list.
    const list = body.data?.region_info;
    if (Array.isArray(list)) {
      for (const n of list) {
        const node = n as { location_id?: string; name?: string };
        if (node.location_id && node.name) map.set(String(node.location_id), String(node.name));
      }
    }
  } catch (err) {
    console.error(`[tiktok-ads] fetchRegionNames failed for ${advertiserId} (non-fatal):`, formatTikTokError(err));
  }
  return map;
}

interface InterestCategoryNode {
  interest_category_id?: string | number;
  interest_category_name?: string;
}

// ─── Fetch interest-category id → name lookup ────────────────────────────────
// GET /tool/interest_category/, response `data.interest_categories` — a FLAT
// array (`sub_category_ids` are bare id strings, no embedded children), field
// names `interest_category_id` + `interest_category_name`. Confirmed live via
// a tiktok_error_log diagnostic dump; an earlier `id`/`name` guess matched
// nothing, hence 0 names on every sync for a while.
//
// The endpoint takes a `version` parameter that this code did not send:
// 1 = interest_category, 2 = interest_category_v2, and 2 is the DEFAULT. So
// every call so far returned the v2 targeting tree — 2-digit top level ("10"
// Education) down to 11-digit leaves ("15100100" Cell Phone Accessories) —
// while the AUDIENCE report's interest_category dimension answers with
// compact 3-digit ids ("101"-"119") that appear nowhere in it.
//
// Both versions are fetched and merged here. v1 is a different taxonomy, not
// an older copy of the same one, and its id shape is the obvious candidate
// for those 3-digit codes. (An earlier attempt at the v1.2 *API* endpoint is
// not the same thing — that returned the identical v2 tree under different
// field names.) If v1 doesn't resolve them either, the raw codes keep
// showing and the diagnostic dump below says what came back.
//
// language=th because these names are read by a Thai marketing team; the
// parameter is documented to accept th and defaults to en.
export async function fetchInterestCategoryNames(advertiserId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (const version of [1, 2]) {
    try {
      const body = await tikTokGet("/tool/interest_category/", {
        advertiser_id: advertiserId,
        version,
        language: "th",
      });
      const categories: InterestCategoryNode[] = body.data?.interest_categories ?? [];
      let found = 0;
      if (Array.isArray(categories)) {
        for (const c of categories) {
          if (c.interest_category_id != null && c.interest_category_name) {
            // First version to supply a name for an id wins, so v1 (fetched
            // first) keeps its labels where the two taxonomies overlap.
            const id = String(c.interest_category_id);
            if (!map.has(id)) map.set(id, String(c.interest_category_name));
            found += 1;
          }
        }
      }
      if (found === 0) {
        const rawBody = JSON.stringify(body.data).slice(0, 1900);
        console.error(`[tiktok-ads] fetchInterestCategoryNames v${version} got 0 names for ${advertiserId} — raw response:`, rawBody);
        // Into tiktok_error_log as well as the console: this runs on whoever
        // has the dev server open, who may not be whoever reads the log next.
        await logApiFailure(`/tool/interest_category/?version=${version} (diag: 0 names, raw response below)`, null, rawBody, null);
      }
    } catch (err) {
      // One version failing must not lose the other's results.
      console.error(`[tiktok-ads] fetchInterestCategoryNames v${version} failed for ${advertiserId} (non-fatal):`, formatTikTokError(err));
    }
  }

  return map;
}

// ─── Fetch audience interests (F13/doc: Interest Alignment) ──────────────────
// CONFIRMED live: the `interest_category` AUDIENCE-report dimension works
// and returns real rows (numeric category ids). Two open issues even with
// the call itself working: (1) no name attached to the id — see
// fetchInterestCategoryNames above; (2) `reach` consistently comes back 0
// for this dimension (TikTok likely can't dedupe reach on this particular
// cut) — dashboard route falls back to `impressions` for the % basis
// when that happens.

export interface TikTokInterestRow {
  advertiser_id: string;
  stat_time_day: string;
  interest_category: string;
  reach: number;
  impressions: number;
}

export async function fetchAudienceInterests(
  advertiserId: string,
  startDate: string,
  endDate: string,
): Promise<TikTokInterestRow[]> {
  const results: TikTokInterestRow[] = [];
  const metrics = ["reach", "impressions"];
  // Confirmed via a live error: TikTok doesn't support a time breakdown
  // together with interest_category ("breakdown by time not supported for
  // dimensions: ['interest_category']") — this comes back as one aggregate
  // row per category for the whole [startDate, endDate] range, not per day.
  const dimensions = ["interest_category"];

  let page = 1;
  let totalPages = 1;

  do {
    const body = await tikTokGet("/report/integrated/get/", {
      advertiser_id: advertiserId,
      report_type: "AUDIENCE",
      data_level: "AUCTION_AD",
      dimensions: JSON.stringify(dimensions),
      metrics: JSON.stringify(metrics),
      start_date: startDate,
      end_date: endDate,
      page,
      page_size: REPORT_PAGE_SIZE,
    });

    const list: {
      dimensions: Record<string, string>;
      metrics: Record<string, string>;
    }[] = body.data?.list ?? [];

    for (const row of list) {
      const dim = row.dimensions;
      const m = row.metrics;
      const category = String(dim.interest_category ?? "");
      if (!category) continue;
      results.push({
        advertiser_id: advertiserId,
        // No per-day breakdown available (see dimensions comment above) —
        // stamp this chunk's end date as a representative bucket so chunks
        // for different date ranges don't collide in the unique constraint.
        stat_time_day: endDate,
        interest_category: category,
        reach: num(m.reach),
        impressions: num(m.impressions),
      });
    }

    const pageInfo = body.data?.page_info;
    totalPages = pageInfo?.total_page ?? 1;
    page += 1;

  } while (page <= totalPages);

  return results;
}

// ─── Fetch hourly engagement (F14: Timing Heatmap) ────────────────────────────
// Uses the `stat_time_hour` dimension for hour-level granularity. Expensive
// per API call relative to daily reports, so callers should keep the date
// range short (a rolling window, not the full history).

export interface TikTokHourlyRow {
  advertiser_id: string;
  campaign_id: string;
  campaign_name: string;
  stat_time_hour: string; // "YYYY-MM-DD HH:00:00"
  spend: number;
  impressions: number;
  video_views: number;
  likes: number;
  comments: number;
  shares: number;
}

export async function fetchHourlyEngagement(
  advertiserId: string,
  startDate: string,
  endDate: string,
): Promise<TikTokHourlyRow[]> {
  const results: TikTokHourlyRow[] = [];
  // campaign_id as a dimension (data_level AUCTION_CAMPAIGN, was
  // AUCTION_ADVERTISER) — per F18, hovering a Timing Heatmap cell needs to
  // say which campaign it's coming from, not just the account-wide total.
  // Same paginated call pattern as every other report here, just more rows
  // per page (one row per campaign × hour instead of one per hour) — not a
  // new request shape.
  const metrics = ["campaign_name", "spend", "impressions", "video_play_actions", "likes", "comments", "shares"];
  const dimensions = ["campaign_id", "stat_time_hour"];

  // Confirmed live: TikTok caps stat_time_hour reports at a 1-day span
  // ("max time span is 1 day when use stat_time_hour") — unlike
  // stat_time_day (30 days), so this can't reuse a multi-day chunk.
  for (const { start, end } of chunkDateRange(startDate, endDate, 1)) {
    let page = 1;
    let totalPages = 1;

    do {
      const body = await tikTokGet("/report/integrated/get/", {
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_CAMPAIGN",
        dimensions: JSON.stringify(dimensions),
        metrics: JSON.stringify(metrics),
        start_date: start,
        end_date: end,
        page,
        page_size: REPORT_PAGE_SIZE,
      });

      const list: {
        dimensions: Record<string, string>;
        metrics: Record<string, string>;
      }[] = body.data?.list ?? [];

      for (const row of list) {
        const dim = row.dimensions;
        const m = row.metrics;
        if (!dim.stat_time_hour) continue;
        results.push({
          advertiser_id: advertiserId,
          campaign_id: dim.campaign_id ?? "",
          campaign_name: m.campaign_name ?? "",
          stat_time_hour: dim.stat_time_hour,
          spend: num(m.spend),
          impressions: num(m.impressions),
          video_views: num(m.video_play_actions),
          likes: num(m.likes),
          comments: num(m.comments),
          shares: num(m.shares),
        });
      }

      const pageInfo = body.data?.page_info;
      totalPages = pageInfo?.total_page ?? 1;
      page += 1;

    } while (page <= totalPages);
  }

  return results;
}

// ─── Fetch campaign objectives (campaign_id → objective_type) ────────────────

export async function fetchCampaignObjectives(
  advertiserId: string,
): Promise<TikTokCampaignInfo[]> {
  const results: TikTokCampaignInfo[] = [];

  let page = 1;
  let totalPages = 1;

  do {
    const body = await tikTokGet("/campaign/get/", {
      advertiser_id: advertiserId,
      fields: JSON.stringify(["campaign_id", "campaign_name", "objective_type"]),
      page,
      page_size: PAGE_SIZE,
    });

    const list: {
      campaign_id: string;
      campaign_name?: string;
      objective_type?: string;
    }[] = body.data?.list ?? [];

    for (const item of list) {
      results.push({
        campaign_id: String(item.campaign_id),
        advertiser_id: advertiserId,
        campaign_name: item.campaign_name ?? "",
        objective_type: item.objective_type ?? "",
      });
    }

    const pageInfo = body.data?.page_info;
    totalPages = pageInfo?.total_page ?? 1;
    page += 1;

  } while (page <= totalPages);

  return results;
}

// ─── Fetch ad creatives (video cover URL) ────────────────────────────────────

export interface TikTokAdCreative {
  ad_id: string;
  advertiser_id: string;
  video_id: string;
  video_cover_url: string;
  caption: string; // best-effort: ad_text from /ad/get/ — moderate confidence, verify against a live account
  create_time: string; // ISO, from /ad/get/
  duration: number; // seconds, from /file/video/ad/get/ — moderate confidence
  tiktok_item_id: string; // Spark Ads (identity_type TT_USER) have no video_id/thumbnail —
  // this is the underlying TikTok post id, used to link straight to the real video instead
}

export async function fetchAdCreatives(
  advertiserId: string,
  adIds: string[],
  /**
   * Post ids whose cover image is already stored. Spark Ad covers never
   * change, so re-fetching them every sync spends the run's whole time
   * budget re-downloading pictures we already have — which is exactly how
   * a 371-ad account ended up with 23 covers: the oEmbed loop ran out of
   * time long before it reached the end of the list, every single run.
   */
  haveCoverItemIds: Set<string> = new Set(),
): Promise<TikTokAdCreative[]> {
  if (adIds.length === 0) return [];

  const results: TikTokAdCreative[] = [];
  const PAGE = 100;

  // Step 1: get video_id + caption + create_time + tiktok_item_id per ad via /ad/get/
  const videoIdMap = new Map<string, string>(); // ad_id → video_id
  const captionMap = new Map<string, string>(); // ad_id → ad_text
  const createTimeMap = new Map<string, string>(); // ad_id → create_time
  const itemIdMap = new Map<string, string>(); // ad_id → tiktok_item_id (Spark Ads)
  let page = 1;
  let totalPages = 1;

  // ad_text/create_time/tiktok_item_id are a best-effort bonus (see
  // TikTokAdCreative comment) — if TikTok rejects one of them, drop to the
  // field set that's been proven to work so a bad bonus field can't take
  // thumbnails down with it (confirmed: all 3 field names are valid as of
  // 2026-08-19, but keep the fallback for future-proofing).
  let adFields = ["ad_id", "video_id", "ad_text", "create_time", "tiktok_item_id"];

  do {
    let body;
    try {
      body = await tikTokGet("/ad/get/", {
        advertiser_id: advertiserId,
        fields: JSON.stringify(adFields),
        page,
        page_size: PAGE,
      });
    } catch (err) {
      if (adFields.length > 2) {
        // retry this same page with just the fields known to work
        adFields = ["ad_id", "video_id"];
        continue;
      }
      console.error(`[tiktok-ads] /ad/get/ failed for ${advertiserId}:`, formatTikTokError(err));
      break; // creatives are best-effort — don't fail the whole sync over thumbnails
    }

    const list: { ad_id: string; video_id?: string; ad_text?: string; create_time?: string; tiktok_item_id?: string }[] =
      body.data?.list ?? [];
    for (const item of list) {
      if (item.video_id) videoIdMap.set(item.ad_id, item.video_id);
      if (item.ad_text) captionMap.set(item.ad_id, item.ad_text);
      if (item.create_time) createTimeMap.set(item.ad_id, item.create_time);
      if (item.tiktok_item_id) itemIdMap.set(item.ad_id, item.tiktok_item_id);
    }

    const pageInfo = body.data?.page_info;
    totalPages = pageInfo?.total_page ?? 1;
    page += 1;
  } while (page <= totalPages);

  // Step 2: get poster_url + duration per video via /file/video/ad/get/
  const videoIds = [...new Set([...videoIdMap.values()])].filter(Boolean);
  const coverMap = new Map<string, string>(); // video_id → poster_url
  const durationMap = new Map<string, number>(); // video_id → duration (s)

  for (let i = 0; i < videoIds.length; i += PAGE) {
    const chunk = videoIds.slice(i, i + PAGE);
    let body;
    try {
      body = await tikTokGet("/file/video/ad/get/", {
        advertiser_id: advertiserId,
        video_ids: JSON.stringify(chunk),
      });
    } catch {
      continue; // best-effort
    }
    const list: { video_id: string; poster_url?: string; duration?: number }[] = body.data?.list ?? [];
    for (const item of list) {
      if (item.poster_url) coverMap.set(item.video_id, item.poster_url);
      if (item.duration) durationMap.set(item.video_id, item.duration);
    }
  }

  // Spark Ads (identity_type TT_USER — see itemIdMap) have no video_id, so
  // /file/video/ad/get/ above never finds them a cover image. TikTok's
  // public oEmbed endpoint gives one anyway, keyed by the underlying post's
  // tiktok_item_id — no Access-Token needed, works for any video. Best-effort:
  // a placeholder username in the URL is enough for TikTok to resolve by ID,
  // but if that ever stops working this just silently keeps returning "".
  //
  // Fetched in parallel batches, not one at a time. oEmbed is TikTok's public
  // web endpoint, not the Ads API, so it has no business consuming the 8 QPS
  // budget rateGate() exists to protect — serialising it there turned ~370
  // posts into minutes of wall clock and blew the sync's 300s limit before
  // most of them were reached.
  const sparkCoverMap = new Map<string, string>(); // tiktok_item_id → thumbnail_url
  const sparkItemIds = [...new Set(itemIdMap.values())]
    .filter(Boolean)
    .filter((id) => !haveCoverItemIds.has(id));
  const OEMBED_BATCH = 10;
  for (let i = 0; i < sparkItemIds.length; i += OEMBED_BATCH) {
    const batch = sparkItemIds.slice(i, i + OEMBED_BATCH);
    const thumbs = await Promise.all(batch.map((id) => fetchOEmbedThumbnail(id)));
    batch.forEach((id, idx) => {
      const thumb = thumbs[idx];
      if (thumb) sparkCoverMap.set(id, thumb);
    });
  }

  // Assemble result only for requested ad_ids — thumbnail download+upload
  // is the slow part, so batch it same as everywhere else in this file
  // (a plain sequential loop over hundreds of ads would meaningfully add
  // to sync wall-clock time).
  const THUMB_BATCH = 10;
  for (let i = 0; i < adIds.length; i += THUMB_BATCH) {
    const batch = adIds.slice(i, i + THUMB_BATCH);
    const batchResults = await Promise.all(
      batch.map(async (adId) => {
        const videoId = videoIdMap.get(adId) ?? "";
        const itemId = itemIdMap.get(adId) ?? "";
        const rawCoverUrl = videoId ? (coverMap.get(videoId) ?? "") : itemId ? (sparkCoverMap.get(itemId) ?? "") : "";
        const coverUrl = rawCoverUrl ? await persistThumbnail(rawCoverUrl, adId) : "";
        return {
          ad_id: adId,
          advertiser_id: advertiserId,
          video_id: videoId,
          video_cover_url: coverUrl,
          caption: captionMap.get(adId) ?? "",
          create_time: createTimeMap.get(adId) ?? "",
          duration: videoId ? (durationMap.get(videoId) ?? 0) : 0,
          tiktok_item_id: itemId,
        };
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

// TEMP DIAGNOSTIC — TikTok's own docs confirm a "Preview an ad or a
// creative" API page exists (business-api.tiktok.com/portal/docs?id=
// 1739403070695426), and their help center confirms the resulting preview
// URL needs no TikTok login and works for any ad (not just Spark Ads) —
// exactly what a non-Spark ad's click-through is missing. The docs page
// itself is a JS-rendered SPA (unreadable without a browser), so probing
// the most likely endpoint paths live instead of guessing blind. Delete
// once the real path is confirmed one way or the other.
export async function debugFindPreviewEndpoint(advertiserId: string, adId: string): Promise<void> {
  const candidates = [
    "/ad/preview/",
    "/creative/preview/",
    "/creative/portfolio/preview/",
    "/tool/preview/",
  ];
  for (const endpoint of candidates) {
    try {
      const body = await tikTokGet(endpoint, { advertiser_id: advertiserId, ad_id: adId, ad_ids: JSON.stringify([adId]) });
      await logApiFailure(`${endpoint} (diag: SUCCESS)`, 200, JSON.stringify(body).slice(0, 1900), null);
    } catch (err) {
      await logApiFailure(`${endpoint} (diag)`, null, formatTikTokError(err), null);
    }
  }
}

/**
 * TikTok's public oEmbed endpoint — no auth, works for any published video by ID.
 *
 * Deliberately does NOT go through rateGate(): that gate exists to stay under
 * the Ads API's 10 QPS app-wide cap, and this is a different service entirely.
 * Callers batch it instead (see fetchAdCreatives).
 */
export async function fetchOEmbedThumbnail(tiktokItemId: string): Promise<string | null> {
  try {
    const res = await axios.get("https://www.tiktok.com/oembed", {
      params: { url: `https://www.tiktok.com/@_/video/${tiktokItemId}` },
      timeout: 8000,
    });
    return res.data?.thumbnail_url ?? null;
  } catch {
    return null; // best-effort — never blocks the rest of the sync
  }
}

const THUMBNAIL_BUCKET = "tiktok-thumbnails";

// Confirmed live (decoded a stored URL's x-expires param): TikTok's cover
// URLs (both /file/video/ad/get/'s poster_url and the oEmbed thumbnail_url
// above) are signed and expire roughly 2 days after being issued. Storing
// that URL as-is meant every thumbnail went dead a couple days after its
// last sync, regardless of viewer — see supabase/migrations/
// 035_tiktok_thumbnail_bucket.sql. Downloads the image once at sync time
// and re-hosts it in Supabase Storage under a permanent URL instead.
// Falls back to the original (still-fresh-for-now) TikTok URL if the
// download/upload fails — a thumbnail that expires in 2 days beats none.
export async function persistThumbnail(sourceUrl: string, adId: string): Promise<string> {
  try {
    const res = await axios.get<ArrayBuffer>(sourceUrl, { responseType: "arraybuffer", timeout: 10000 });
    const contentType = (res.headers["content-type"] as string) || "image/jpeg";
    const path = `${adId}.jpg`;
    const sb = getSupabase();
    const { error } = await sb.storage.from(THUMBNAIL_BUCKET).upload(path, res.data, { contentType, upsert: true });
    if (error) return sourceUrl;
    return sb.storage.from(THUMBNAIL_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return sourceUrl;
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Split a date range into 30-day chunks to stay under API limits.
 */
export function chunkDateRange(
  startDate: string,
  endDate: string,
  chunkDays = 30,
): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  let cursor = new Date(startDate);
  const last = new Date(endDate);

  while (cursor <= last) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
    if (chunkEnd > last) chunkEnd.setTime(last.getTime());

    chunks.push({
      start: cursor.toISOString().slice(0, 10),
      end: chunkEnd.toISOString().slice(0, 10),
    });

    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return chunks;
}

// ─── Numeric helper ───────────────────────────────────────────────────────────
function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}

export { formatTikTokError };
