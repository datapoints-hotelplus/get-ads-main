import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAccountReach, fetchCampaignReach } from "@/lib/facebook";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { startDate, endDate, account_name, campaign_name, adset_name } =
    body as {
      startDate?: string;
      endDate?: string;
      account_name?: string | string[];
      campaign_name?: string | string[];
      adset_name?: string | string[];
    };

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 },
    );
  }

  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken)
    return NextResponse.json(
      { error: "FB_ACCESS_TOKEN not set" },
      { status: 500 },
    );

  const supabase = getSupabase();

  // Helper: normalize string | string[] → string[]
  function toArray(v?: string | string[]): string[] {
    if (!v) return [];
    return (Array.isArray(v) ? v : [v])
      .flatMap((x) => x.split(","))
      .map((x) => x.trim())
      .filter(Boolean);
  }

  const accountNames = toArray(account_name);
  const campaignNames = toArray(campaign_name);
  const adsetNames = toArray(adset_name);

  // Resolve account IDs from allpage
  let accountQuery = supabase
    .from("ads_allpage")
    .select("account_id, account_name")
    .eq("is_active", true);
  if (accountNames.length > 0)
    accountQuery = accountQuery.in("account_name", accountNames);
  const { data: pageRows, error: pageErr } = await accountQuery;
  if (pageErr)
    return NextResponse.json({ error: pageErr.message }, { status: 500 });

  const accounts = (pageRows ?? []) as {
    account_id: string;
    account_name: string;
  }[];
  if (!accounts.length)
    return NextResponse.json(
      {
        error: "ไม่พบ account — ตรวจสอบ account_name หรือรัน Get All Page ก่อน",
      },
      { status: 400 },
    );

  const accountIds = accounts.map((a) => a.account_id);

  // If adset_name filter provided, resolve which campaign_names contain those adsets
  let adsetCampaignNames: string[] = [];
  if (adsetNames.length > 0) {
    let adsetQuery = supabase
      .from("ads_rawdata")
      .select("campaign_name")
      .in("adset_name", adsetNames);
    if (accountNames.length > 0)
      adsetQuery = adsetQuery.in("account_name", accountNames);
    const { data: adsetRows } = await adsetQuery;
    adsetCampaignNames = [
      ...new Set(
        (adsetRows ?? []).map((r) => r.campaign_name as string).filter(Boolean),
      ),
    ];
    if (!adsetCampaignNames.length)
      return NextResponse.json({
        date_start: startDate,
        date_stop: endDate,
        reach: 0,
        campaigns: [],
      });
  }

  // Fetch reach from Facebook
  const [totalReach, campaignReachMap] = await Promise.all([
    fetchAccountReach(accountIds, accessToken, startDate, endDate),
    fetchCampaignReach(accountIds, accessToken, startDate, endDate),
  ]);

  // Build campaigns array — apply campaign_name + adset-resolved filters
  const allowedCampaigns = new Set<string>();
  const hasCampaignFilter = campaignNames.length > 0;
  const hasAdsetFilter = adsetCampaignNames.length > 0;

  for (const name of campaignReachMap.keys()) {
    if (hasCampaignFilter && !campaignNames.includes(name)) continue;
    if (hasAdsetFilter && !adsetCampaignNames.includes(name)) continue;
    allowedCampaigns.add(name);
  }

  // Build account_id → account_name map from allpage
  const accIdToName = new Map<string, string>();
  for (const a of accounts) {
    accIdToName.set(a.account_id, a.account_name);
  }

  const campaigns = Array.from(campaignReachMap.entries())
    .filter(
      ([name]) =>
        (!hasCampaignFilter && !hasAdsetFilter) || allowedCampaigns.has(name),
    )
    .map(([campaign_name, { campaign_id, account_id, reach }]) => ({
      campaign_id,
      campaign_name,
      reach,
      account_name: accIdToName.get(account_id) ?? "",
    }))
    .sort((a, b) => b.reach - a.reach);

  // Filtered total = sum of filtered campaigns (when filters active)
  const filteredReach =
    hasCampaignFilter || hasAdsetFilter
      ? campaigns.reduce((s, c) => s + c.reach, 0)
      : totalReach;

  return NextResponse.json({
    date_start: startDate,
    date_stop: endDate,
    reach: filteredReach,
    campaigns,
  });
}
