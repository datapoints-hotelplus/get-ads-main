import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  fetchAccountCampaignInsights,
  fetchAccountReachByAccount,
  type CampaignInsightRow,
} from "@/lib/facebook";
import { getFacebookAccessToken } from "@/lib/facebook-token";

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

  // Build id→name map for display labels
  const accountMap = new Map(allAccounts.map((a) => [a.account_id as string, a.account_name as string]));
  const accountLabels = accountIds.map((id) => accountMap.get(id) ?? id);

  // rawdata.account_id stores bare number (no act_ prefix)
  const rawAccountIds = accountIds.map((id) => id.replace(/^act_/, ""));

  // Fetch rawdata aggregated per account — filter by account_id (immune to name changes)
  let q = supabase
    .from("ads_rawdata")
    .select("account_id,campaign_name,spend,impressions,clicks_all,reach,leads,messaging_conversations_started,purchases,purchase_value,frequency,cpm,cpc,ctr,ctr_all,inline_link_clicks,unique_inline_link_clicks,post_engagement,cost_per_engagement,cost_per_like,post_shares,post_comments,post_reactions,page_likes,video_views_3s,video_p25,video_p50,video_p75,video_p100,video_avg_time,hook_rate,hold_rate,cost_per_result")
    .in("account_id", rawAccountIds);
  if (dateFrom) q = q.gte("date_start", dateFrom);
  if (dateTo) q = q.lte("date_start", dateTo);

  const allRaw: Record<string, unknown>[] = [];
  let offset = 0;
  const CHUNK = 1000;
  while (true) {
    const { data: chunk, error: chunkErr } = await q.range(offset, offset + CHUNK - 1);
    if (chunkErr) return NextResponse.json({ error: chunkErr.message }, { status: 500 });
    allRaw.push(...(chunk ?? []));
    if ((chunk ?? []).length < CHUNK) break;
    offset += CHUNK;
  }
  const raw = allRaw;

  type Agg = {
    spend: number; impressions: number; clicks: number; reach: number;
    leads: number; messages: number; purchases: number; purchase_value: number;
    frequency: number; cpm: number; cpc: number; ctr: number; ctr_all: number;
    inline_link_clicks: number; unique_inline_link_clicks: number;
    post_engagement: number; cost_per_engagement: number; cost_per_like: number;
    post_shares: number; post_comments: number; post_reactions: number; page_likes: number;
    video_views_3s: number; video_p25: number; video_p50: number; video_p75: number;
    video_p100: number; video_avg_time: number; hook_rate: number; hold_rate: number;
    cost_per_result: number; rows: number;
    fb_cost_per_result?: number;
  };
  const agg = new Map<string, Agg>();
  for (const r of raw ?? []) {
    const name = r.account_id as string;
    if (!agg.has(name)) agg.set(name, {
      spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, messages: 0, purchases: 0, purchase_value: 0,
      frequency: 0, cpm: 0, cpc: 0, ctr: 0, ctr_all: 0,
      inline_link_clicks: 0, unique_inline_link_clicks: 0,
      post_engagement: 0, cost_per_engagement: 0, cost_per_like: 0,
      post_shares: 0, post_comments: 0, post_reactions: 0, page_likes: 0,
      video_views_3s: 0, video_p25: 0, video_p50: 0, video_p75: 0,
      video_p100: 0, video_avg_time: 0, hook_rate: 0, hold_rate: 0,
      cost_per_result: 0, rows: 0,
    });
    const a = agg.get(name)!;
    a.spend    += Number(r.spend ?? 0);
    a.impressions += Number(r.impressions ?? 0);
    a.clicks   += Number(r.clicks_all ?? 0);
    a.reach    += Number(r.reach ?? 0);
    a.leads    += Number(r.leads ?? 0);
    a.messages += Number(r.messaging_conversations_started ?? 0);
    a.purchases += Number(r.purchases ?? 0);
    a.purchase_value += Number(r.purchase_value ?? 0);
    a.inline_link_clicks += Number(r.inline_link_clicks ?? 0);
    a.unique_inline_link_clicks += Number(r.unique_inline_link_clicks ?? 0);
    a.post_engagement += Number(r.post_engagement ?? 0);
    a.post_shares  += Number(r.post_shares ?? 0);
    a.post_comments += Number(r.post_comments ?? 0);
    a.post_reactions += Number(r.post_reactions ?? 0);
    a.page_likes   += Number(r.page_likes ?? 0);
    a.video_views_3s += Number(r.video_views_3s ?? 0);
    a.video_p25 += Number(r.video_p25 ?? 0);
    a.video_p50 += Number(r.video_p50 ?? 0);
    a.video_p75 += Number(r.video_p75 ?? 0);
    a.video_p100 += Number(r.video_p100 ?? 0);
    // average per row
    a.frequency    += Number(r.frequency ?? 0);
    a.video_avg_time += Number(r.video_avg_time ?? 0);
    a.hook_rate    += Number(r.hook_rate ?? 0);
    a.hold_rate    += Number(r.hold_rate ?? 0);
    a.cost_per_result += Number(r.cost_per_result ?? 0);
    a.rows += 1;
  }

  function getMetricValue(metric: string, a: Agg): number | null {
    const n = a.rows || 1; // number of rows for averaging
    switch (metric) {
      case "spend":        return a.spend;
      case "impressions":  return a.impressions;
      case "clicks":       return a.clicks;
      case "reach":        return a.reach;
      case "leads":        return a.leads;
      case "messages":     return a.messages;
      case "purchases":    return a.purchases;
      case "purchase_value": return a.purchase_value;
      case "inline_link_clicks": return a.inline_link_clicks;
      case "unique_inline_link_clicks": return a.unique_inline_link_clicks;
      case "post_engagement": return a.post_engagement;
      case "post_shares":  return a.post_shares;
      case "post_comments": return a.post_comments;
      case "post_reactions": return a.post_reactions;
      case "page_likes":   return a.page_likes;
      case "video_views_3s": return a.video_views_3s;
      case "video_p25":    return a.video_p25 / n;
      case "video_p50":    return a.video_p50 / n;
      case "video_p75":    return a.video_p75 / n;
      case "video_p100":   return a.video_p100 / n;
      case "video_avg_time": return a.video_avg_time / n;
      case "hook_rate":    return a.hook_rate / n;
      case "hold_rate":    return a.hold_rate / n;
      case "frequency":    return a.reach > 0 ? a.impressions / a.reach : null;
      // calculated from totals (weighted)
      case "roas":         return a.spend > 0 ? a.purchase_value / a.spend : null;
      case "cpc":          return a.clicks > 0 ? a.spend / a.clicks : null;
      case "cpm":          return a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null;
      case "ctr":          return a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null;
      case "ctr_all":      return a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null;
      case "cost_per_lead": return a.leads > 0 ? a.spend / a.leads : null;
      case "cost_per_message": return a.messages > 0 ? a.spend / a.messages : null;
      case "cost_per_purchase": return a.purchases > 0 ? a.spend / a.purchases : null;
      case "cost_per_engagement": return a.post_engagement > 0 ? a.spend / a.post_engagement : null;
      case "cost_per_like": return a.page_likes > 0 ? a.spend / a.page_likes : null;
      case "cost_per_result":
        // Prefer FB's objective-aware value (matches Ads Manager); fall back to DB avg.
        if (a.fb_cost_per_result != null) return a.fb_cost_per_result;
        return a.rows > 0 ? a.cost_per_result / a.rows : null;
      default: return null;
    }
  }

  const EMPTY_AGG: Agg = {
    spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, messages: 0, purchases: 0, purchase_value: 0,
    frequency: 0, cpm: 0, cpc: 0, ctr: 0, ctr_all: 0,
    inline_link_clicks: 0, unique_inline_link_clicks: 0,
    post_engagement: 0, cost_per_engagement: 0, cost_per_like: 0,
    post_shares: 0, post_comments: 0, post_reactions: 0, page_likes: 0,
    video_views_3s: 0, video_p25: 0, video_p50: 0, video_p75: 0,
    video_p100: 0, video_avg_time: 0, hook_rate: 0, hold_rate: 0,
    cost_per_result: 0, rows: 0,
  };

  function buildAgg(rows: Record<string, unknown>[], accountId: string, campaignPrefix: string | null): Agg {
    const a = { ...EMPTY_AGG };
    let matched = 0;
    for (const r of rows) {
      if (r.account_id !== accountId) continue;
      if (campaignPrefix) {
        const prefixes = campaignPrefix.split(",").map((p) => p.trim()).filter(Boolean);
        const name = (r.campaign_name as string) ?? "";
        if (!prefixes.some((p) => name.startsWith(p))) continue;
      }
      matched++;
      a.spend    += Number(r.spend ?? 0);
      a.impressions += Number(r.impressions ?? 0);
      a.clicks   += Number(r.clicks_all ?? 0);
      a.reach    += Number(r.reach ?? 0);
      a.leads    += Number(r.leads ?? 0);
      a.messages += Number(r.messaging_conversations_started ?? 0);
      a.purchases += Number(r.purchases ?? 0);
      a.purchase_value += Number(r.purchase_value ?? 0);
      a.inline_link_clicks += Number(r.inline_link_clicks ?? 0);
      a.unique_inline_link_clicks += Number(r.unique_inline_link_clicks ?? 0);
      a.post_engagement += Number(r.post_engagement ?? 0);
      a.post_shares  += Number(r.post_shares ?? 0);
      a.post_comments += Number(r.post_comments ?? 0);
      a.post_reactions += Number(r.post_reactions ?? 0);
      a.page_likes   += Number(r.page_likes ?? 0);
      a.video_views_3s += Number(r.video_views_3s ?? 0);
      a.video_p25 += Number(r.video_p25 ?? 0);
      a.video_p50 += Number(r.video_p50 ?? 0);
      a.video_p75 += Number(r.video_p75 ?? 0);
      a.video_p100 += Number(r.video_p100 ?? 0);
      a.frequency    += Number(r.frequency ?? 0);
      a.video_avg_time += Number(r.video_avg_time ?? 0);
      a.hook_rate    += Number(r.hook_rate ?? 0);
      a.hold_rate    += Number(r.hold_rate ?? 0);
      a.cost_per_result += Number(r.cost_per_result ?? 0);
      a.rows += 1;
    }
    console.log(`[buildAgg] account=${accountId} filter=${campaignPrefix} matched=${matched} spend=${a.spend} page_likes=${a.page_likes}`);
    return a;
  }

  // Two FB calls per account, all in parallel → latency ≈ one call:
  //  - level=account reach/impressions → FQ that matches Ads Manager EXACTLY
  //    (FB dedups a person seen across campaigns/days; only account level does this)
  //  - level=campaign spend + objective-aware cost_per_result → CPR by name prefix
  let fbInsights = new Map<string, CampaignInsightRow[]>();
  let fbReach = new Map<string, { reach: number; impressions: number }>();
  if (dateFrom && dateTo) {
    try {
      const token = await getFacebookAccessToken();
      if (token) {
        [fbReach, fbInsights] = await Promise.all([
          fetchAccountReachByAccount(accountIds, token, dateFrom, dateTo),
          fetchAccountCampaignInsights(accountIds, token, dateFrom, dateTo),
        ]);
        for (const acctId of accountIds) {
          const fb = fbReach.get(acctId);
          const a = agg.get(acctId.replace(/^act_/, ""));
          if (a && fb && fb.reach > 0) {
            a.reach = fb.reach;
            a.impressions = fb.impressions; // account-level, same source as reach
          }
        }
      }
    } catch (e) {
      console.error("[portfolio] FB override failed, using DB values", e);
    }
  }

  // Weighted cost_per_result across the campaigns whose name matches a prefix:
  // total spend / total results, where results = spend / cpr per campaign.
  function fbCostPerResult(acctId: string, campaignPrefix: string | null): number | null {
    const camps = fbInsights.get(acctId);
    if (!camps) return null;
    const prefixes = (campaignPrefix ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    let spend = 0;
    let results = 0;
    for (const c of camps) {
      if (prefixes.length && !prefixes.some((p) => c.campaign_name.startsWith(p))) continue;
      if (c.cost_per_result > 0) {
        spend += c.spend;
        results += c.spend / c.cost_per_result;
      }
    }
    return results > 0 ? spend / results : null;
  }

  const rows = rawAccountIds.map((rawId, i) => {
    const acctId = accountIds[i];
    const baseAgg = agg.get(rawId) ?? { ...EMPTY_AGG };
    const metrics: Record<string, number | null> = {};
    for (const t of templates ?? []) {
      const filter = (t as Record<string, unknown>).campaign_filter as string | null ?? null;
      const a = filter ? buildAgg(raw, rawId, filter) : baseAgg;
      if (t.metric === "cost_per_result") {
        const fbVal = fbCostPerResult(acctId, filter);
        a.fb_cost_per_result = fbVal ?? undefined; // falls back to DB avg when null
      }
      metrics[t.id] = getMetricValue(t.metric, a);
    }
    return { account_name: accountLabels[i], spend: baseAgg.spend, clicks: baseAgg.clicks, impressions: baseAgg.impressions, reach: baseAgg.reach, leads: baseAgg.leads, messages: baseAgg.messages, purchases: baseAgg.purchases, purchase_value: baseAgg.purchase_value, metrics };
  });

  return NextResponse.json({ templates, profile, rows, presetIds, allAccounts });
}

