import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/portfolio?profile_id=&dateFrom=&dateTo=&account_ids=id1&account_ids=id2
// account_ids overrides the profile preset when provided
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const profileId = searchParams.get("profile_id");
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const overrideIds = searchParams.getAll("account_ids");

  if (!profileId) return NextResponse.json({ error: "profile_id required" }, { status: 400 });

  const supabase = getSupabase();

  // Load all templates
  const { data: templates, error: tErr } = await supabase
    .from("ads_portfolio_templates")
    .select("*")
    .order("created_at", { ascending: true });
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  // Load profile + preset accounts
  const { data: profile, error: pErr } = await supabase
    .from("ads_portfolio_profiles")
    .select("id, name, ads_portfolio_profile_accounts(account_id)")
    .eq("id", profileId)
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // Use override if provided, otherwise use preset
  const presetIds = (profile.ads_portfolio_profile_accounts as { account_id: string }[]).map((a) => a.account_id);
  const accountIds = overrideIds.length > 0 ? overrideIds : presetIds;

  // Load all active accounts (for the selector UI)
  const { data: allAccountRows } = await supabase
    .from("ads_allpage")
    .select("account_id, account_name")
    .eq("is_active", true)
    .order("account_name");
  const allAccounts = allAccountRows ?? [];

  if (accountIds.length === 0) return NextResponse.json({ templates, profile, rows: [], presetIds, allAccounts });

  // Resolve account names for selected ids
  const accountMap = new Map(allAccounts.map((a) => [a.account_id as string, a.account_name as string]));
  const accountNames = accountIds.map((id) => accountMap.get(id)).filter(Boolean) as string[];

  if (accountNames.length === 0) return NextResponse.json({ templates, profile, rows: [], presetIds, allAccounts });

  // Fetch rawdata aggregated per account
  let q = supabase
    .from("ads_rawdata")
    .select("account_name,spend,impressions,clicks_all,reach,leads,messaging_conversations_started,purchases,purchase_value")
    .in("account_name", accountNames)
    .gt("spend", 0);
  if (dateFrom) q = q.gte("date_start", dateFrom);
  if (dateTo) q = q.lte("date_start", dateTo);

  const { data: raw, error: rErr } = await q.limit(200000);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  type Agg = {
    spend: number; impressions: number; clicks: number; reach: number;
    leads: number; messages: number; purchases: number; purchase_value: number;
  };
  const agg = new Map<string, Agg>();
  console.log(agg);
  for (const r of raw ?? []) {
    const name = r.account_name as string;
    if (!agg.has(name)) agg.set(name, { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, messages: 0, purchases: 0, purchase_value: 0 });
    const a = agg.get(name)!;
    a.spend += Number(r.spend ?? 0);
    a.impressions += Number(r.impressions ?? 0);
    a.clicks += Number(r.clicks_all ?? 0);
    a.reach += Number(r.reach ?? 0);
    a.leads += Number(r.leads ?? 0);
    a.messages += Number(r.messaging_conversations_started ?? 0);
    a.purchases += Number(r.purchases ?? 0);
    a.purchase_value += Number(r.purchase_value ?? 0);
  }

  function getMetricValue(metric: string, a: Agg): number | null {
    switch (metric) {
      case "spend": return a.spend;
      case "impressions": return a.impressions;
      case "clicks": return a.clicks;
      case "reach": return a.reach;
      case "leads": return a.leads;
      case "messages": return a.messages;
      case "purchases": return a.purchases;
      case "purchase_value": return a.purchase_value;
      case "roas": return a.spend > 0 ? a.purchase_value / a.spend : null;
      case "cpc": return a.clicks > 0 ? a.spend / a.clicks : null;
      case "cpm": return a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null;
      case "ctr": return a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null;
      case "cost_per_lead": return a.leads > 0 ? a.spend / a.leads : null;
      case "cost_per_message": return a.messages > 0 ? a.spend / a.messages : null;
      case "cost_per_purchase": return a.purchases > 0 ? a.spend / a.purchases : null;
      default: return null;
    }
  }

  const rows = accountNames.map((name) => {
    const a = agg.get(name) ?? { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, messages: 0, purchases: 0, purchase_value: 0 };
    const metrics: Record<string, number | null> = {};
    for (const t of templates ?? []) metrics[t.id] = getMetricValue(t.metric, a);
    return { account_name: name, spend: a.spend, clicks: a.clicks, impressions: a.impressions, reach: a.reach, leads: a.leads, messages: a.messages, purchases: a.purchases, purchase_value: a.purchase_value, metrics };
  });

  return NextResponse.json({ templates, profile, rows, presetIds, allAccounts });
}

