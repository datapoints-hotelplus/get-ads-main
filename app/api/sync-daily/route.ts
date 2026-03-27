// ดึงข้อมูลเมื่อวาน แล้วตัดวันเก่าสุดออก → DB มีแค่ย้อนหลัง 6 เดือนเสมอ
import { NextResponse } from "next/server";
import axios from "axios";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { getSupabase } from "@/lib/supabase";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

type FBAction = { action_type: string; value: string };
type FBItem = { actions?: FBAction[]; action_values?: FBAction[] } & Record<string, unknown>;
type SheetKey = "rawdata" | "geo" | "demographic" | "device";

const BASE_FIELDS = [
  "ad_id", "ad_name", "spend", "reach", "impressions", "inline_link_clicks",
  "actions", "action_values", "date_start", "date_stop",
].join(",");

const RAWDATA_FIELDS = [
  "date_start", "date_stop", "account_name", "campaign_name", "adset_name", "ad_name",
  "campaign_id", "adset_id", "ad_id", "objective",
  "spend", "frequency", "reach", "impressions",
  "inline_link_clicks", "unique_inline_link_clicks", "inline_link_click_ctr", "cpm", "cpc",
  "actions", "action_values",
  "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p100_watched_actions",
  "video_avg_time_watched_actions",
].join(",");

const SCHEMA: Record<SheetKey, { breakdown: string | null; fields: string }> = {
  rawdata:     { breakdown: null,                fields: RAWDATA_FIELDS },
  geo:         { breakdown: "region",            fields: BASE_FIELDS },
  demographic: { breakdown: "age,gender",        fields: BASE_FIELDS },
  device:      { breakdown: "impression_device", fields: BASE_FIELDS },
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
  const impressions = parseInt(String(item.impressions ?? "0"), 10);
  const video_p25  = findVideoAction(item.video_p25_watched_actions,  "video_view");
  const video_p50  = findVideoAction(item.video_p50_watched_actions,  "video_view");
  const video_p75  = findVideoAction(item.video_p75_watched_actions,  "video_view");
  const video_p100 = findVideoAction(item.video_p100_watched_actions, "video_view");
  const video_avg_time = findVideoAction(item.video_avg_time_watched_actions, "video_view");
  const video_views_3s = findAction(item.actions, "video_view");
  return {
    date_start:    String(item.date_start ?? ""),
    date_stop:     String(item.date_stop ?? ""),
    account_name:  String(item.account_name ?? ""),
    campaign_name: String(item.campaign_name ?? ""),
    adset_name:    String(item.adset_name ?? ""),
    ad_name:       String(item.ad_name ?? ""),
    campaign_id:   String(item.campaign_id ?? ""),
    adset_id:      String(item.adset_id ?? ""),
    ad_id:         String(item.ad_id ?? ""),
    objective:     String(item.objective ?? ""),
    spend, frequency: num(item.frequency),
    reach: parseInt(String(item.reach ?? "0"), 10), impressions,
    inline_link_clicks: clicks,
    unique_inline_link_clicks: parseInt(String(item.unique_inline_link_clicks ?? "0"), 10),
    cpm: num(item.cpm),
    cpc: clicks > 0 ? parseFloat((spend / clicks).toFixed(4)) : 0,
    ctr: impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(4)) : 0,
    purchases, purchase_value,
    roas: spend > 0 ? parseFloat((purchase_value / spend).toFixed(4)) : 0,
    cost_per_result: purchases > 0 ? parseFloat((spend / purchases).toFixed(4)) : 0,
    video_views_3s, video_p25, video_p50, video_p75, video_p100, video_avg_time,
    hook_rate: impressions > 0 ? parseFloat(((video_views_3s / impressions) * 100).toFixed(4)) : 0,
    hold_rate: video_views_3s > 0 ? parseFloat(((video_p100 / video_views_3s) * 100).toFixed(4)) : 0,
    messaging_conversations_started: findAction(item.actions, "onsite_conversion.messaging_conversation_started_7d"),
    leads:          findAction(item.actions, "lead"),
    post_shares:    findAction(item.actions, "post"),
    post_comments:  findAction(item.actions, "comment"),
    post_reactions: findAction(item.actions, "post_reaction"),
    page_likes:     findAction(item.actions, "like"),
  };
}

function toGeo(item: FBItem) {
  return {
    date_start: String(item.date_start ?? ""), date_stop: String(item.date_stop ?? ""),
    ad_id: String(item.ad_id ?? ""), ad_name: String(item.ad_name ?? ""),
    region: String(item.region ?? ""),
    spend: num(item.spend),
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions: parseInt(String(item.impressions ?? "0"), 10),
    inline_link_clicks: parseInt(String(item.inline_link_clicks ?? "0"), 10),
    purchases: findAction(item.actions, "purchase"),
    purchase_value: findAction(item.action_values, "purchase"),
  };
}

function toDemographic(item: FBItem) {
  return {
    date_start: String(item.date_start ?? ""), date_stop: String(item.date_stop ?? ""),
    ad_id: String(item.ad_id ?? ""), ad_name: String(item.ad_name ?? ""),
    age: String(item.age ?? ""), gender: String(item.gender ?? ""),
    spend: num(item.spend),
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions: parseInt(String(item.impressions ?? "0"), 10),
    inline_link_clicks: parseInt(String(item.inline_link_clicks ?? "0"), 10),
    purchases: findAction(item.actions, "purchase"),
    purchase_value: findAction(item.action_values, "purchase"),
  };
}

function toDevice(item: FBItem) {
  return {
    date_start: String(item.date_start ?? ""), date_stop: String(item.date_stop ?? ""),
    ad_id: String(item.ad_id ?? ""), ad_name: String(item.ad_name ?? ""),
    impression_device: String(item.impression_device ?? ""),
    spend: num(item.spend),
    reach: parseInt(String(item.reach ?? "0"), 10),
    impressions: parseInt(String(item.impressions ?? "0"), 10),
    inline_link_clicks: parseInt(String(item.inline_link_clicks ?? "0"), 10),
    purchases: findAction(item.actions, "purchase"),
    purchase_value: findAction(item.action_values, "purchase"),
  };
}

async function fetchDay(
  accountId: string,
  accessToken: string,
  date: string,
  sheetKey: SheetKey,
): Promise<FBItem[]> {
  const { breakdown, fields } = SCHEMA[sheetKey];
  const items: FBItem[] = [];
  let nextUrl: string | null = null;
  let firstRequest = true;

  while (firstRequest || nextUrl) {
    firstRequest = false;
    const res: { data: { data?: FBItem[]; paging?: { next?: string } } } = nextUrl
      ? await axios.get(nextUrl)
      : await axios.get(`${FB_GRAPH_API}/act_${accountId}/insights`, {
          params: {
            level: "ad",
            fields,
            ...(breakdown ? { breakdowns: breakdown } : {}),
            time_range: JSON.stringify({ since: date, until: date }),
            time_increment: 1,
            limit: 1000,
            access_token: accessToken,
          },
        });
    const page_items = (res.data.data ?? []).filter((i) => num(i.spend) > 0);
    items.push(...page_items);
    nextUrl = res.data.paging?.next ?? null;
  }

  console.log(`  [${sheetKey}][${date}] ${items.length} rows`);
  return items;
}

async function insertDay(
  table: string,
  rows: Record<string, unknown>[],
  date: string,
): Promise<void> {
  if (rows.length === 0) return;

  const supabase = getSupabase();
  const adIds = [...new Set(rows.map((r) => r.ad_id as string))];
  await supabase.from(table).delete().eq("date_start", date).in("ad_id", adIds);
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`Supabase insert ${table}: ${error.message}`);
  }
}

async function trimOldData(cutoff: string): Promise<void> {
  const supabase = getSupabase();
  const tables = ["ads_rawdata", "ads_geo", "ads_demographic", "ads_device"];
  await Promise.all(
    tables.map((t) => supabase.from(t).delete().lt("date_start", cutoff)),
  );
  console.log(`  [trim] deleted rows before ${cutoff}`);
}

function getSheetsClient() {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!credentialsJson) throw new Error("GOOGLE_CREDENTIALS_JSON is not set");
  const credentials = JSON.parse(credentialsJson);
  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function getAccountIds(): Promise<{ name: string; id: string }[]> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_ID is not set");
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "PageIDs!A2:B" });
  return (res.data.values ?? [])
    .filter((row) => row[1]?.trim())
    .map((row) => ({ name: String(row[0] ?? ""), id: String(row[1]).trim() }));
}

export async function POST() {
  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "Missing FB_ACCESS_TOKEN" }, { status: 400 });
  }

  const accounts = await getAccountIds();
  if (accounts.length === 0) {
    return NextResponse.json({ error: "ไม่พบ Account ID ใน PageIDs sheet" }, { status: 404 });
  }

  // เมื่อวาน
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().slice(0, 10);

  // cutoff = 6 เดือนย้อนหลัง
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  const cutoff = cutoffDate.toISOString().slice(0, 10);

  console.log(`\n[sync-daily] date=${date}, cutoff=${cutoff}, accounts=${accounts.length}`);

  const summary: { name: string; id: string; rows: Record<SheetKey, number>; error?: string }[] = [];
  const streamKeys: SheetKey[] = ["rawdata", "geo", "demographic", "device"];

  for (const [idx, account] of accounts.entries()) {
    console.log(`\n[sync-daily] [${idx + 1}/${accounts.length}] ${account.name}`);
    const rowCounts: Record<SheetKey, number> = { rawdata: 0, geo: 0, demographic: 0, device: 0 };

    try {
      // Fetch all 4 streams in parallel (just 1 day — safe)
      const [rawItems, geoItems, demoItems, deviceItems] = await Promise.all(
        streamKeys.map((key) => fetchDay(account.id, accessToken, date, key)),
      );

      // Insert yesterday's data
      await Promise.all([
        insertDay("ads_rawdata",     rawItems.map(toRawdata),     date),
        insertDay("ads_geo",         geoItems.map(toGeo),         date),
        insertDay("ads_demographic", demoItems.map(toDemographic),date),
        insertDay("ads_device",      deviceItems.map(toDevice),   date),
      ]);

      rowCounts.rawdata     = rawItems.length;
      rowCounts.geo         = geoItems.length;
      rowCounts.demographic = demoItems.length;
      rowCounts.device      = deviceItems.length;

      summary.push({ name: account.name, id: account.id, rows: rowCounts });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error(`  [ERROR] ${msg}`);
      summary.push({ name: account.name, id: account.id, rows: rowCounts, error: msg });
    }

    if (idx < accounts.length - 1) await sleep(3000);
  }

  // ตัดข้อมูลเก่าออก ให้เหลือแค่ 6 เดือน
  await trimOldData(cutoff);

  console.log("[sync-daily] DONE ✓\n");
  return NextResponse.json({ success: true, date, cutoff, accounts: summary });
}
