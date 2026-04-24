import { NextResponse } from "next/server";
import axios from "axios";
import { getSupabase } from "@/lib/supabase";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

type FBAction = { action_type: string; value: string };
type FBItem = { actions?: FBAction[]; action_values?: FBAction[] } & Record<
  string,
  unknown
>;
type SheetKey = "rawdata" | "geo" | "demographic" | "device";

// ─── Field lists ──────────────────────────────────────────────────────────────

const BASE_FIELDS = [
  "ad_id",
  "ad_name",
  "spend",
  "reach",
  "impressions",
  "inline_link_clicks",
  "clicks",
  "actions",
  "action_values",
  "date_start",
  "date_stop",
].join(",");

const RAWDATA_FIELDS = [
  "date_start",
  "date_stop",
  "account_name",
  "campaign_name",
  "adset_name",
  "ad_name",
  "campaign_id",
  "adset_id",
  "ad_id",
  "objective",
  "spend",
  "frequency",
  "reach",
  "impressions",
  "clicks",
  "inline_link_clicks",
  "unique_inline_link_clicks",
  "inline_link_click_ctr",
  "cpm",
  "cpc",
  "actions",
  "action_values",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
  "video_avg_time_watched_actions",
].join(",");

const SCHEMA: Record<
  SheetKey,
  { breakdown: string | null; fields: string; timeIncrement: number }
> = {
  rawdata: { breakdown: null, fields: RAWDATA_FIELDS, timeIncrement: 1 },
  geo: { breakdown: "region", fields: BASE_FIELDS, timeIncrement: 7 },
  demographic: {
    breakdown: "age,gender",
    fields: BASE_FIELDS,
    timeIncrement: 1,
  },
  device: {
    breakdown: "impression_device",
    fields: BASE_FIELDS,
    timeIncrement: 1,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}

function findAction(arr: FBAction[] | undefined, type: string): number {
  return num(arr?.find((a) => a.action_type === type)?.value);
}

function findVideoAction(arr: unknown, type: string): number {
  if (!Array.isArray(arr)) return 0;
  return num((arr as FBAction[]).find((a) => a.action_type === type)?.value);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Deduplicate rows by composite key (Facebook can return same row on multiple pages) ───
function dedupe(
  rows: Record<string, unknown>[],
  keyFields: string[],
): Record<string, unknown>[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keyFields.map((f) => String(row[f] ?? "")).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Row parsers → plain objects for Supabase ─────────────────────────────────

function toRawdata(item: FBItem) {
  const spend = num(item.spend);
  const purchases = findAction(item.actions, "purchase");
  const purchase_value = findAction(item.action_values, "purchase");
  const clicks = parseInt(String(item.inline_link_clicks ?? "0"), 10);
  const clicks_all = clicks;
  const impressions = parseInt(String(item.impressions ?? "0"), 10);
  const video_p25 = findVideoAction(
    item.video_p25_watched_actions,
    "video_view",
  );
  const video_p50 = findVideoAction(
    item.video_p50_watched_actions,
    "video_view",
  );
  const video_p75 = findVideoAction(
    item.video_p75_watched_actions,
    "video_view",
  );
  const video_p100 = findVideoAction(
    item.video_p100_watched_actions,
    "video_view",
  );
  const video_avg_time = findVideoAction(
    item.video_avg_time_watched_actions,
    "video_view",
  );
  // 3-second views = video_view action
  const video_views_3s = findAction(item.actions, "video_view");
  const hook_rate =
    impressions > 0
      ? parseFloat(((video_views_3s / impressions) * 100).toFixed(4))
      : 0;
  const hold_rate =
    video_views_3s > 0
      ? parseFloat(((video_p100 / video_views_3s) * 100).toFixed(4))
      : 0;
  const post_engagement = findAction(item.actions, "post_engagement");
  const page_likes = findAction(item.actions, "like");
  const cost_per_engagement =
    post_engagement > 0 ? parseFloat((spend / post_engagement).toFixed(4)) : 0;
  const cost_per_like =
    page_likes > 0 ? parseFloat((spend / page_likes).toFixed(4)) : 0;

  return {
    date_start: String(item.date_start ?? ""),
    date_stop: String(item.date_stop ?? ""),
    account_name: String(item.account_name ?? ""),
    campaign_name: String(item.campaign_name ?? ""),
    adset_name: String(item.adset_name ?? ""),
    ad_name: String(item.ad_name ?? ""),
    campaign_id: String(item.campaign_id ?? ""),
    adset_id: String(item.adset_id ?? ""),
    ad_id: String(item.ad_id ?? ""),
    objective: String(item.objective ?? ""),
    spend,
    frequency: num(item.frequency),
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions,
    inline_link_clicks: clicks,
    clicks_all,
    unique_inline_link_clicks: parseInt(
      String(item.unique_inline_link_clicks ?? "0"),
      10,
    ),
    cpm: num(item.cpm),
    cpc: clicks_all > 0 ? parseFloat((spend / clicks_all).toFixed(4)) : 0,
    ctr:
      impressions > 0
        ? parseFloat(((clicks / impressions) * 100).toFixed(4))
        : 0,
    ctr_all:
      impressions > 0
        ? parseFloat(((clicks_all / impressions) * 100).toFixed(4))
        : 0,
    purchases,
    purchase_value,
    roas: spend > 0 ? parseFloat((purchase_value / spend).toFixed(4)) : 0,
    cost_per_result:
      purchases > 0 ? parseFloat((spend / purchases).toFixed(4)) : 0,
    // Video engagement
    video_views_3s,
    video_p25,
    video_p50,
    video_p75,
    video_p100,
    video_avg_time,
    hook_rate,
    hold_rate,
    // Messaging & Leads
    messaging_conversations_started: findAction(
      item.actions,
      "onsite_conversion.messaging_conversation_started_7d",
    ),
    // Sum form leads + pixel custom conversions to cover both campaign objective types
    leads:
      findAction(item.actions, "lead") +
      findAction(item.actions, "offsite_conversion.fb_pixel_custom"),
    // Post interactions
    post_shares: findAction(item.actions, "post"),
    post_comments: findAction(item.actions, "comment"),
    post_reactions: findAction(item.actions, "post_reaction"),
    page_likes,
    post_engagement,
    cost_per_engagement,
    cost_per_like,
  };
}

function toGeo(item: FBItem) {
  const spend = num(item.spend);
  const purchases = findAction(item.actions, "purchase");
  return {
    date_start: String(item.date_start ?? ""),
    date_stop: String(item.date_stop ?? ""),
    ad_id: String(item.ad_id ?? ""),
    ad_name: String(item.ad_name ?? ""),
    region: String(item.region ?? ""),
    spend,
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions: parseInt(String(item.impressions ?? "0"), 10),
    inline_link_clicks: parseInt(String(item.inline_link_clicks ?? "0"), 10),
    purchases,
    purchase_value: findAction(item.action_values, "purchase"),
  };
}

function toDemographic(item: FBItem) {
  const spend = num(item.spend);
  const purchases = findAction(item.actions, "purchase");
  return {
    date_start: String(item.date_start ?? ""),
    date_stop: String(item.date_stop ?? ""),
    ad_id: String(item.ad_id ?? ""),
    ad_name: String(item.ad_name ?? ""),
    age: String(item.age ?? ""),
    gender: String(item.gender ?? ""),
    spend,
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions: parseInt(String(item.impressions ?? "0"), 10),
    inline_link_clicks: parseInt(String(item.inline_link_clicks ?? "0"), 10),
    purchases,
    purchase_value: findAction(item.action_values, "purchase"),
  };
}

function toDevice(item: FBItem) {
  const spend = num(item.spend);
  const purchases = findAction(item.actions, "purchase");
  return {
    date_start: String(item.date_start ?? ""),
    date_stop: String(item.date_stop ?? ""),
    ad_id: String(item.ad_id ?? ""),
    ad_name: String(item.ad_name ?? ""),
    impression_device: String(item.impression_device ?? ""),
    spend,
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions: parseInt(String(item.impressions ?? "0"), 10),
    inline_link_clicks: parseInt(String(item.inline_link_clicks ?? "0"), 10),
    purchases,
    purchase_value: findAction(item.action_values, "purchase"),
  };
}

// ─── Fetch one month, all pages (with retry) ─────────────────────────────────

async function fbGet(
  url: string,
  params?: Record<string, unknown>,
  retries = 7,
): Promise<{ data: { data?: FBItem[]; paging?: { next?: string } } }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return params ? await axios.get(url, { params }) : await axios.get(url);
    } catch (err) {
      lastErr = err;
      const status = axios.isAxiosError(err) ? err.response?.status : null;
      const fbErr = axios.isAxiosError(err)
        ? (
            err.response?.data as {
              error?: {
                code?: number;
                error_subcode?: number;
                message?: string;
                is_transient?: boolean;
              };
            }
          )?.error
        : undefined;
      const fbServiceTemporarilyUnavailable =
        fbErr?.code === 2 &&
        (fbErr?.error_subcode === 1504044 ||
          String(fbErr?.message ?? "")
            .toLowerCase()
            .includes("service temporarily unavailable"));
      const retryable =
        !status ||
        status >= 500 ||
        status === 429 ||
        fbErr?.is_transient === true ||
        fbServiceTemporarilyUnavailable;
      if (!retryable || attempt === retries) throw err;
      // 5s, 10s, 20s, 40s, 80s, 120s (capped) — covers ~5 min of Facebook outages
      const delay = Math.min(5000 * 2 ** (attempt - 1), 120_000);
      // small random jitter (±10%) to avoid thundering-herd on concurrent streams
      const jitter = Math.floor(delay * 0.1 * (Math.random() * 2 - 1));
      console.warn(
        `  [retry ${attempt}/${retries - 1}] status=${status ?? "network"} — wait ${((delay + jitter) / 1000).toFixed(1)}s`,
      );
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
  throw lastErr;
}

async function fetchMonth(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
  sheetKey: SheetKey,
): Promise<FBItem[]> {
  const { breakdown, fields, timeIncrement } = SCHEMA[sheetKey];
  const items: FBItem[] = [];
  let nextUrl: string | null = null;
  let firstRequest = true;
  let page = 0;

  while (firstRequest || nextUrl) {
    firstRequest = false;
    page++;

    const res: { data: { data?: FBItem[]; paging?: { next?: string } } } =
      nextUrl
        ? await fbGet(nextUrl)
        : await fbGet(`${FB_GRAPH_API}/act_${accountId}/insights`, {
            level: "ad",
            fields,
            ...(breakdown ? { breakdowns: breakdown } : {}),
            time_range: JSON.stringify({ since, until }),
            time_increment: timeIncrement,
            limit: 1000,
            access_token: accessToken,
          });

    const page_items = (res.data.data ?? []).filter(
      (i: FBItem) => num(i.spend) > 0,
    );
    items.push(...page_items);
    nextUrl = res.data.paging?.next ?? null;

    console.log(
      `  [${sheetKey}][${since}→${until}] page ${page} — +${page_items.length} (total ${items.length})${nextUrl ? " →" : " ✓"}`,
    );
  }

  return items;
}

// deleteByUniqueKeysAndInsert removed — use dedupe() + deleteAndInsert(..., false) instead

function formatAxiosError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : String(err);
  }

  const status = err.response?.status;
  const data = err.response?.data as
    | {
        error?: {
          message?: string;
          code?: number;
          error_subcode?: number;
          type?: string;
          fbtrace_id?: string;
          is_transient?: boolean;
        };
      }
    | undefined;
  const fb = data?.error;

  if (!fb) {
    return status ? `HTTP ${status}: ${err.message}` : err.message;
  }

  return [
    status ? `HTTP ${status}` : "HTTP error",
    fb.type ? `type=${fb.type}` : null,
    fb.code ? `code=${fb.code}` : null,
    fb.error_subcode ? `subcode=${fb.error_subcode}` : null,
    fb.is_transient ? "transient=true" : null,
    fb.message ?? err.message,
  ]
    .filter(Boolean)
    .join(" | ");
}

// ─── Supabase delete + insert per chunk ──────────────────────────────────────

async function deleteAndInsert(
  table: string,
  rows: Record<string, unknown>[],
  since: string,
  until: string,
  hasAccountName = true,
): Promise<void> {
  if (rows.length === 0) return;

  const supabase = getSupabase();
  const DEL_CHUNK = 200;

  if (hasAccountName) {
    // Group rows by account_name to delete only their own data
    const accountGroups = new Map<string, string[]>();
    for (const row of rows) {
      const account = String(row.account_name ?? "");
      const adId = String(row.ad_id ?? "");
      if (!accountGroups.has(account)) accountGroups.set(account, []);
      accountGroups.get(account)!.push(adId);
    }

    for (const [account, adIds] of accountGroups.entries()) {
      const uniqueAdIds = [...new Set(adIds)];
      for (let i = 0; i < uniqueAdIds.length; i += DEL_CHUNK) {
        const chunk = uniqueAdIds.slice(i, i + DEL_CHUNK);
        const { error: delErr } = await supabase
          .from(table)
          .delete()
          .eq("account_name", account)
          .gte("date_start", since)
          .lte("date_start", until)
          .in("ad_id", chunk);
        if (delErr)
          throw new Error(`Supabase delete ${table}: ${delErr.message}`);
      }
    }
  } else {
    // Tables without account_name (geo, demographic, device) — delete by ad_id + date range
    const allAdIds = [...new Set(rows.map((r) => String(r.ad_id ?? "")))];
    for (let i = 0; i < allAdIds.length; i += DEL_CHUNK) {
      const chunk = allAdIds.slice(i, i + DEL_CHUNK);
      const { error: delErr } = await supabase
        .from(table)
        .delete()
        .gte("date_start", since)
        .lte("date_start", until)
        .in("ad_id", chunk);
      if (delErr)
        throw new Error(`Supabase delete ${table}: ${delErr.message}`);
    }
  }

  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(table)
      .insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`Supabase insert ${table}: ${error.message}`);
  }
}

// ─── Read account IDs ─────────────────────────────────────────────────────────

async function getAccountIds(): Promise<{ name: string; id: string }[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ads_allpage")
    .select("account_name, account_id")
    .eq("is_active", true)
    .order("account_name");
  if (error) throw new Error(`allpage read failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    name: String(row.account_name ?? ""),
    id: String(row.account_id ?? "").replace(/^act_/, ""),
  }));
}

// ─── Monthly chunks ───────────────────────────────────────────────────────────

function monthChunks(
  since: string,
  until: string,
): { since: string; until: string }[] {
  const chunks: { since: string; until: string }[] = [];
  const end = new Date(until);
  let cur = new Date(since);
  while (cur <= end) {
    const chunkSince = cur.toISOString().slice(0, 10);
    const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const chunkUntil = (lastDay > end ? end : lastDay)
      .toISOString()
      .slice(0, 10);
    chunks.push({ since: chunkSince, until: chunkUntil });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return chunks;
}

// ─── Main route ───────────────────────────────────────────────────────────────

export async function POST() {
  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing FB_ACCESS_TOKEN" },
      { status: 400 },
    );
  }

  const accounts = await getAccountIds();
  if (accounts.length === 0) {
    return NextResponse.json(
      { error: "ไม่พบ Account ID ใน PageIDs sheet" },
      { status: 404 },
    );
  }

  const until = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Bangkok",
  });
  // ย้อนหลัง 1 ปีนับจากวันที่กด
  const sinceDate = new Date(until);
  sinceDate.setFullYear(sinceDate.getFullYear() - 1);
  sinceDate.setDate(sinceDate.getDate() + 1);
  const since = sinceDate.toISOString().slice(0, 10);
  const chunks = monthChunks(since, until);

  console.log(
    `\n[sync-backfill] START — ${since} → ${until} (daily), ${accounts.length} accounts, ${chunks.length} months`,
  );

  const summary: {
    name: string;
    id: string;
    rows: Record<SheetKey, number>;
    error?: string;
  }[] = [];

  for (const [idx, account] of accounts.entries()) {
    console.log(
      `\n[sync-backfill] [${idx + 1}/${accounts.length}] ${account.name} (act_${account.id})`,
    );
    const rowCounts: Record<SheetKey, number> = {
      rawdata: 0,
      geo: 0,
      demographic: 0,
      device: 0,
    };

    try {
      for (const chunk of chunks) {
        console.log(
          `  [${chunk.since}→${chunk.until}] fetching & saving 4 streams in parallel...`,
        );

        // Fetch + save each stream in parallel (each saves to DB as soon as its fetch completes)
        const streamJobs: Array<Promise<{ key: SheetKey; count: number }>> = [
          fetchMonth(
            account.id,
            accessToken,
            chunk.since,
            chunk.until,
            "rawdata",
          ).then(async (items) => {
            await deleteAndInsert(
              "ads_rawdata",
              items.map(toRawdata),
              chunk.since,
              chunk.until,
              true,
            );
            console.log(`  ✓ rawdata saved: ${items.length} rows`);
            return { key: "rawdata" as const, count: items.length };
          }),
          fetchMonth(
            account.id,
            accessToken,
            chunk.since,
            chunk.until,
            "geo",
          ).then(async (items) => {
            const rows = dedupe(items.map(toGeo), [
              "ad_id",
              "date_start",
              "region",
            ]);
            await deleteAndInsert(
              "ads_geo",
              rows,
              chunk.since,
              chunk.until,
              false,
            );
            console.log(`  ✓ geo saved: ${rows.length} rows`);
            return { key: "geo" as const, count: rows.length };
          }),
          fetchMonth(
            account.id,
            accessToken,
            chunk.since,
            chunk.until,
            "demographic",
          ).then(async (items) => {
            const rows = dedupe(items.map(toDemographic), [
              "ad_id",
              "date_start",
              "age",
              "gender",
            ]);
            await deleteAndInsert(
              "ads_demographic",
              rows,
              chunk.since,
              chunk.until,
              false,
            );
            console.log(`  ✓ demographic saved: ${rows.length} rows`);
            return { key: "demographic" as const, count: rows.length };
          }),
          fetchMonth(
            account.id,
            accessToken,
            chunk.since,
            chunk.until,
            "device",
          ).then(async (items) => {
            const rows = dedupe(items.map(toDevice), [
              "ad_id",
              "date_start",
              "impression_device",
            ]);
            await deleteAndInsert(
              "ads_device",
              rows,
              chunk.since,
              chunk.until,
              false,
            );
            console.log(`  ✓ device saved: ${rows.length} rows`);
            return { key: "device" as const, count: rows.length };
          }),
        ];

        const settled = await Promise.allSettled(streamJobs);
        const chunkCounts: Record<SheetKey, number> = {
          rawdata: 0,
          geo: 0,
          demographic: 0,
          device: 0,
        };

        for (const result of settled) {
          if (result.status === "fulfilled") {
            rowCounts[result.value.key] += result.value.count;
            chunkCounts[result.value.key] = result.value.count;
            continue;
          }
          console.error(`  [stream-error] ${formatAxiosError(result.reason)}`);
        }

        console.log(
          `  ✓ chunk done — raw:${chunkCounts.rawdata} geo:${chunkCounts.geo} demo:${chunkCounts.demographic} device:${chunkCounts.device}`,
        );
        await sleep(500);
      }

      summary.push({ name: account.name, id: account.id, rows: rowCounts });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error(`  [ERROR] ${msg}`);
      summary.push({
        name: account.name,
        id: account.id,
        rows: rowCounts,
        error: msg,
      });
    }

    if (idx < accounts.length - 1) {
      console.log("  ...waiting 3s");
      await sleep(3000);
    }
  }

  console.log("[sync-backfill] DONE ✓\n");
  return NextResponse.json({ success: true, since, until, accounts: summary });
}
