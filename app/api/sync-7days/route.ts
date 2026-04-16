// ดึงข้อมูลย้อนหลัง 7 วัน (00:00–23:59 ทุกวัน) แล้ว upsert เข้า Supabase
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
  const video_views_3s = findAction(item.actions, "video_view");
  const post_engagement = findAction(item.actions, "post_engagement");
  const page_likes = findAction(item.actions, "like");
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
    video_views_3s,
    video_p25,
    video_p50,
    video_p75,
    video_p100,
    video_avg_time,
    hook_rate:
      impressions > 0
        ? parseFloat(((video_views_3s / impressions) * 100).toFixed(4))
        : 0,
    hold_rate:
      video_views_3s > 0
        ? parseFloat(((video_p100 / video_views_3s) * 100).toFixed(4))
        : 0,
    messaging_conversations_started: findAction(
      item.actions,
      "onsite_conversion.messaging_conversation_started_7d",
    ),
    leads: findAction(item.actions, "lead"),
    post_shares: findAction(item.actions, "post"),
    post_comments: findAction(item.actions, "comment"),
    post_reactions: findAction(item.actions, "post_reaction"),
    page_likes,
    post_engagement,
    cost_per_engagement:
      post_engagement > 0
        ? parseFloat((spend / post_engagement).toFixed(4))
        : 0,
    cost_per_like:
      page_likes > 0 ? parseFloat((spend / page_likes).toFixed(4)) : 0,
  };
}

function toGeo(item: FBItem) {
  const clicks = parseInt(String(item.inline_link_clicks ?? "0"), 10);
  return {
    date_start: String(item.date_start ?? ""),
    date_stop: String(item.date_stop ?? ""),
    ad_id: String(item.ad_id ?? ""),
    ad_name: String(item.ad_name ?? ""),
    region: String(item.region ?? ""),
    spend: num(item.spend),
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions: parseInt(String(item.impressions ?? "0"), 10),
    inline_link_clicks: clicks,
    clicks_all: clicks,
    purchases: findAction(item.actions, "purchase"),
    purchase_value: findAction(item.action_values, "purchase"),
  };
}

function toDemographic(item: FBItem) {
  const clicks = parseInt(String(item.inline_link_clicks ?? "0"), 10);
  return {
    date_start: String(item.date_start ?? ""),
    date_stop: String(item.date_stop ?? ""),
    ad_id: String(item.ad_id ?? ""),
    ad_name: String(item.ad_name ?? ""),
    age: String(item.age ?? ""),
    gender: String(item.gender ?? ""),
    spend: num(item.spend),
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions: parseInt(String(item.impressions ?? "0"), 10),
    inline_link_clicks: clicks,
    clicks_all: clicks,
    purchases: findAction(item.actions, "purchase"),
    purchase_value: findAction(item.action_values, "purchase"),
  };
}

function toDevice(item: FBItem) {
  const clicks = parseInt(String(item.inline_link_clicks ?? "0"), 10);
  return {
    date_start: String(item.date_start ?? ""),
    date_stop: String(item.date_stop ?? ""),
    ad_id: String(item.ad_id ?? ""),
    ad_name: String(item.ad_name ?? ""),
    impression_device: String(item.impression_device ?? ""),
    spend: num(item.spend),
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions: parseInt(String(item.impressions ?? "0"), 10),
    inline_link_clicks: clicks,
    clicks_all: clicks,
    purchases: findAction(item.actions, "purchase"),
    purchase_value: findAction(item.action_values, "purchase"),
  };
}

async function fetchRange(
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
        ? await axios.get(nextUrl)
        : await axios.get(`${FB_GRAPH_API}/act_${accountId}/insights`, {
            params: {
              level: "ad",
              fields,
              ...(breakdown ? { breakdowns: breakdown } : {}),
              time_range: JSON.stringify({ since, until }),
              time_increment: timeIncrement,
              limit: 1000,
              access_token: accessToken,
            },
          });
    const page_items = (res.data.data ?? []).filter((i) => num(i.spend) > 0);
    items.push(...page_items);
    nextUrl = res.data.paging?.next ?? null;
    console.log(
      `  [${sheetKey}][${since}→${until}] page ${page} +${page_items.length} (total ${items.length})${nextUrl ? " →" : " ✓"}`,
    );
  }
  return items;
}

// ─── Delete duplicates based on unique key then insert ─────────────────────────

async function deleteByUniqueKeysAndInsert(
  table: string,
  rows: Record<string, unknown>[],
  uniqueKeyFields: string[],
): Promise<void> {
  if (rows.length === 0) return;

  const supabase = getSupabase();

  // ดึง ad_id ทั้งหมดที่จะ insert
  const adIds = [...new Set(rows.map((r) => String(r.ad_id ?? "")))].filter(
    (id) => id,
  );
  if (adIds.length === 0) return;

  // SELECT ข้อมูลเก่าทั้งหมด (ครั้งเดียว) ⚡
  const { data: existingRecords } = await supabase
    .from(table)
    .select("id, " + uniqueKeyFields.join(", "))
    .in("ad_id", adIds);

  // หา IDs ที่ต้องลบ (in-memory comparison)
  const idsToDelete: string[] = [];
  for (const newRow of rows) {
    const newKey = uniqueKeyFields
      .map((f) => String(newRow[f] ?? ""))
      .join("|");

    for (const existing of (existingRecords ?? []) as unknown as Record<string, unknown>[]) {
      const existingKey = uniqueKeyFields
        .map((f) => String(existing[f] ?? ""))
        .join("|");

      if (newKey === existingKey) {
        idsToDelete.push(existing.id as string);
      }
    }
  }

  // DELETE BULK (ครั้งเดียว!) ⚡
  if (idsToDelete.length > 0) {
    const DEL_CHUNK = 1000;
    for (let i = 0; i < idsToDelete.length; i += DEL_CHUNK) {
      const { error: delErr } = await supabase
        .from(table)
        .delete()
        .in("id", idsToDelete.slice(i, i + DEL_CHUNK));
      if (delErr) throw new Error(`delete ${table}: ${delErr.message}`);
    }
  }

  // INSERT (parallel) ⚡
  const CHUNK = 1000;
  const insertPromises = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    insertPromises.push(
      supabase
        .from(table)
        .insert(rows.slice(i, i + CHUNK))
        .then(({ error }) => {
          if (error) throw new Error(`insert ${table}: ${error.message}`);
        }),
    );
  }
  await Promise.allSettled(insertPromises);
}

// ─── Supabase delete + insert per chunk ──────────────────────────────────────

async function deleteAndInsert(
  table: string,
  rows: Record<string, unknown>[],
  since: string,
  until: string,
): Promise<void> {
  if (rows.length === 0) return;

  const supabase = getSupabase();
  const accountGroups = new Map<string, string[]>();
  for (const row of rows) {
    const account = String(row.account_name ?? "");
    const adId = String(row.ad_id ?? "");
    if (!accountGroups.has(account)) accountGroups.set(account, []);
    accountGroups.get(account)!.push(adId);
  }

  const DEL_CHUNK = 200;
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

  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(table)
      .insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`Supabase insert ${table}: ${error.message}`);
  }
}

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

// ─── GET handler — ดึงข้อมูลย้อนหลัง 7 วัน (00:00–23:59) ────────────────────

export async function GET() {
  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing FB_ACCESS_TOKEN" },
      { status: 400 },
    );
  }

  let accounts: { name: string; id: string }[];
  try {
    accounts = await getAccountIds();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load accounts" },
      { status: 500 },
    );
  }

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: "ไม่พบ Active Account" },
      { status: 404 },
    );
  }

  // since = 7 วันที่แล้ว, until = เมื่อวาน (00:00–23:59 ครบทุกวัน)
  const untilDate = new Date();
  untilDate.setDate(untilDate.getDate() - 1);
  const sinceDate = new Date(untilDate);
  sinceDate.setDate(sinceDate.getDate() - 6);

  const since = sinceDate.toISOString().slice(0, 10);
  const until = untilDate.toISOString().slice(0, 10);

  console.log(
    `\n[sync-7days] START — ${since} → ${until}, ${accounts.length} accounts`,
  );

  type SheetCounts = Record<SheetKey, number>;
  const summary: {
    name: string;
    id: string;
    rows: SheetCounts;
    error?: string;
  }[] = [];

  for (const [idx, account] of accounts.entries()) {
    console.log(
      `\n[sync-7days] [${idx + 1}/${accounts.length}] ${account.name}`,
    );
    const rowCounts: SheetCounts = {
      rawdata: 0,
      geo: 0,
      demographic: 0,
      device: 0,
    };

    try {
      const [rawItems, geoItems, demoItems, deviceItems] = await Promise.all([
        fetchRange(account.id, accessToken, since, until, "rawdata"),
        fetchRange(account.id, accessToken, since, until, "geo"),
        fetchRange(account.id, accessToken, since, until, "demographic"),
        fetchRange(account.id, accessToken, since, until, "device"),
      ]);

      await Promise.all([
        deleteAndInsert("ads_rawdata", rawItems.map(toRawdata), since, until),
        deleteByUniqueKeysAndInsert("ads_geo", geoItems.map(toGeo), [
          "ad_id",
          "date_start",
          "region",
        ]),
        deleteByUniqueKeysAndInsert(
          "ads_demographic",
          demoItems.map(toDemographic),
          ["ad_id", "date_start", "age", "gender"],
        ),
        deleteByUniqueKeysAndInsert("ads_device", deviceItems.map(toDevice), [
          "ad_id",
          "date_start",
          "impression_device",
        ]),
      ]);

      rowCounts.rawdata = rawItems.length;
      rowCounts.geo = geoItems.length;
      rowCounts.demographic = demoItems.length;
      rowCounts.device = deviceItems.length;

      console.log(
        `  ✓ raw:${rawItems.length} geo:${geoItems.length} demo:${demoItems.length} device:${deviceItems.length}`,
      );
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

    if (idx < accounts.length - 1) await sleep(3000);
  }

  console.log("[sync-7days] DONE ✓\n");
  return NextResponse.json({ success: true, since, until, accounts: summary });
}
