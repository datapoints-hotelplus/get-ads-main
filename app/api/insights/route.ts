import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getSupabase } from "@/lib/supabase";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

type FBAction = { action_type: string; value: string };
type FBItem = { actions?: FBAction[]; action_values?: FBAction[] } & Record<string, unknown>;

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

function parseRow(item: FBItem) {
  const spend = num(item.spend);
  const clicks = parseInt(String(item.inline_link_clicks ?? "0"), 10);
  const impressions = parseInt(String(item.impressions ?? "0"), 10);
  const purchases = findAction(item.actions, "purchase");
  const purchase_value = findAction(item.action_values, "purchase");
  const video_views_3s = findAction(item.actions, "video_view");
  const video_p25  = findVideoAction(item.video_p25_watched_actions,  "video_view");
  const video_p50  = findVideoAction(item.video_p50_watched_actions,  "video_view");
  const video_p75  = findVideoAction(item.video_p75_watched_actions,  "video_view");
  const video_p100 = findVideoAction(item.video_p100_watched_actions, "video_view");
  const video_avg_time = findVideoAction(item.video_avg_time_watched_actions, "video_view");
  const hook_rate = impressions > 0 ? parseFloat(((video_views_3s / impressions) * 100).toFixed(4)) : 0;
  const hold_rate = video_views_3s > 0 ? parseFloat(((video_p100 / video_views_3s) * 100).toFixed(4)) : 0;

  return {
    date_start:               String(item.date_start ?? ""),
    date_stop:                String(item.date_stop ?? ""),
    account_name:             String(item.account_name ?? ""),
    campaign_name:            String(item.campaign_name ?? ""),
    adset_name:               String(item.adset_name ?? ""),
    ad_name:                  String(item.ad_name ?? ""),
    campaign_id:              String(item.campaign_id ?? ""),
    adset_id:                 String(item.adset_id ?? ""),
    ad_id:                    String(item.ad_id ?? ""),
    objective:                String(item.objective ?? ""),
    spend,
    frequency:                num(item.frequency),
    reach:                    parseInt(String(item.reach ?? "0"), 10),
    impressions,
    inline_link_clicks:       clicks,
    unique_inline_link_clicks: parseInt(String(item.unique_inline_link_clicks ?? "0"), 10),
    cpm:                      num(item.cpm),
    cpc:                      clicks > 0 ? parseFloat((spend / clicks).toFixed(4)) : 0,
    ctr:                      impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(4)) : 0,
    purchases,
    purchase_value,
    roas:                     spend > 0 ? parseFloat((purchase_value / spend).toFixed(4)) : 0,
    cost_per_result:          purchases > 0 ? parseFloat((spend / purchases).toFixed(4)) : 0,
    video_views_3s,
    video_p25, video_p50, video_p75, video_p100,
    video_avg_time,
    hook_rate,
    hold_rate,
    messaging_conversations_started: findAction(item.actions, "onsite_conversion.messaging_conversation_started_7d"),
    leads:          findAction(item.actions, "lead"),
    post_shares:    findAction(item.actions, "post"),
    post_comments:  findAction(item.actions, "comment"),
    post_reactions: findAction(item.actions, "post_reaction"),
    page_likes:     findAction(item.actions, "like"),
  };
}

async function fetchPages(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
  fields: string,
  level: string,
): Promise<FBItem[]> {
  const items: FBItem[] = [];
  let url: string | null =
    `${FB_GRAPH_API}/${accountId}/insights?fields=${fields}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&filtering=${encodeURIComponent(JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 0 }]))}` +
    `&level=${level}&limit=500&access_token=${accessToken}`;

  while (url) {
    const res: { data: { data?: FBItem[]; paging?: { next?: string } } } = await axios.get(url);
    items.push(...(res.data.data ?? []));
    url = res.data.paging?.next ?? null;
  }
  return items;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate   = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(startDate) || !dateRe.test(endDate)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 },
    );
  }

  if (startDate > endDate) {
    return NextResponse.json(
      { error: "startDate must be before or equal to endDate" },
      { status: 400 },
    );
  }

  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json({ error: "FB_ACCESS_TOKEN not set" }, { status: 500 });

  // account_name filter: ?account_name=A&account_name=B  or  ?account_name=A,B
  const accountNames = searchParams
    .getAll("account_name")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);

  const supabase = getSupabase();
  let query = supabase.from("allpage").select("account_id");
  if (accountNames.length > 0) {
    query = query.in("account_name", accountNames);
  }
  const { data: pageRows, error: pageErr } = await query;
  if (pageErr) return NextResponse.json({ error: `allpage read failed: ${pageErr.message}` }, { status: 500 });

  const accountIds = (pageRows ?? []).map((r: { account_id: string }) => r.account_id).filter(Boolean);
  if (!accountIds.length) return NextResponse.json({ error: "allpage table is empty — run Get All Page first" }, { status: 400 });

  // ?summary=reach → fetch at account level, return deduplicated reach total
  const wantSummary = searchParams.get("summary") === "reach";

  if (wantSummary) {
    let totalReach = 0;
    for (const accountId of accountIds) {
      const items = await fetchPages(accountId, accessToken, startDate, endDate, "reach", "account");
      totalReach += items.reduce((s, item) => s + parseInt(String(item.reach ?? "0"), 10), 0);
    }
    return NextResponse.json({ reach: totalReach, startDate, endDate });
  }

  const rows: ReturnType<typeof parseRow>[] = [];
  for (const accountId of accountIds) {
    const items = await fetchPages(accountId, accessToken, startDate, endDate, RAWDATA_FIELDS, "ad");
    for (const item of items) {
      rows.push(parseRow(item));
    }
  }

  return NextResponse.json({ total: rows.length, data: rows });
}
