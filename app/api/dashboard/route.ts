import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAccountReach, fetchCampaignReach } from "@/lib/facebook";

// GET /api/dashboard?type=options
// GET /api/dashboard?type=data&dateFrom=&dateTo=&account=&campaign=&adset=

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") ?? "data";

  try {
    const supabase = getSupabase();

    if (type === "options") {
      // Return distinct filter values (cascading)
      const account = searchParams.get("account") ?? "";
      const campaign = searchParams.get("campaign") ?? "";

      // Account names from allpage table
      const { data: accountData, error: accountErr } = await supabase
        .from("allpage")
        .select("account_name")
        .order("account_name");
      if (accountErr) throw accountErr;
      const accounts = [
        ...new Set((accountData ?? []).map((r) => r.account_name as string)),
      ].filter(Boolean);

      // Fetch all distinct campaign+adset pairs via RPC (avoids row-limit issue)
      // Falls back to direct query if RPC not yet created
      let pairsData: { campaign_name: string; adset_name: string }[] = [];
      const rpcRes = await supabase.rpc("get_campaign_adset_pairs", {
        p_account: account || null,
      });
      if (!rpcRes.error) {
        pairsData = rpcRes.data ?? [];
      } else {
        // Fallback: direct query without ordering (avoids alphabetical bias in limit)
        let q = supabase
          .from("ads_rawdata")
          .select("campaign_name,adset_name")
          .limit(50000);
        if (account) q = q.eq("account_name", account);
        const fallback = await q;
        if (fallback.error) throw fallback.error;
        pairsData = (fallback.data ?? []) as {
          campaign_name: string;
          adset_name: string;
        }[];
      }

      const campaigns = [
        ...new Set((pairsData ?? []).map((r) => r.campaign_name as string)),
      ].filter(Boolean);

      // Adsets: if campaign filter active, only show adsets under that campaign
      const adsetSource = campaign
        ? (pairsData ?? []).filter((r) => r.campaign_name === campaign)
        : (pairsData ?? []);
      const adsets = [
        ...new Set(adsetSource.map((r) => r.adset_name as string)),
      ].filter(Boolean);

      return NextResponse.json({ accounts, campaigns, adsets });
    }

    // type === "data" — aggregate rows with filters
    const dateFrom = searchParams.get("dateFrom") ?? "";
    const dateTo = searchParams.get("dateTo") ?? "";
    const account = searchParams.get("account") ?? "";
    const campaign = searchParams.get("campaign") ?? "";
    const adset = searchParams.get("adset") ?? "";

    // Calculate previous period (same duration, shifted back)
    let prevFrom = "";
    let prevTo = "";
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
      const pTo = new Date(from);
      pTo.setDate(pTo.getDate() - 1);
      const pFrom = new Date(pTo);
      pFrom.setDate(pFrom.getDate() - days + 1);
      prevFrom = pFrom.toISOString().split("T")[0];
      prevTo = pTo.toISOString().split("T")[0];
    }

    const selectFields =
      "date_start,date_stop,account_name,campaign_name,adset_name,ad_name," +
      "spend,reach,impressions,inline_link_clicks,unique_inline_link_clicks," +
      "purchases,purchase_value,cpc,ctr,cpm,frequency," +
      "leads,messaging_conversations_started,post_shares,page_likes";

    function buildQuery(from: string, to: string) {
      let q = supabase
        .from("ads_rawdata")
        .select(selectFields)
        .order("date_start", { ascending: false });
      if (from) q = q.gte("date_start", from);
      if (to) q = q.lte("date_start", to);
      if (account) q = q.eq("account_name", account);
      if (campaign) q = q.eq("campaign_name", campaign);
      if (adset) q = q.eq("adset_name", adset);
      return q.limit(5000);
    }

    // Fetch current + previous period data + account IDs + all campaign/adset pairs in parallel
    const [currentRes, prevRes, pageRes, allPairsRes] = await Promise.all([
      buildQuery(dateFrom, dateTo),
      prevFrom
        ? buildQuery(prevFrom, prevTo)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("allpage")
        .select("account_id, account_name")
        .then((r) => r),
      // All distinct campaign+adset combos via RPC (no row-limit issue)
      supabase
        .rpc("get_campaign_adset_pairs", { p_account: account || null })
        .then((r) => r),
    ]);

    if (currentRes.error) throw currentRes.error;
    if (prevRes.error) throw prevRes.error;

    type RawRow = {
      date_start: string;
      date_stop: string;
      account_name: string;
      campaign_name: string;
      adset_name: string;
      ad_name: string;
      spend: number;
      reach: number;
      impressions: number;
      inline_link_clicks: number;
      unique_inline_link_clicks: number;
      purchases: number;
      purchase_value: number;
      cpc: number;
      ctr: number;
      cpm: number;
      frequency: number;
      leads: number;
      messaging_conversations_started: number;
      post_shares: number;
      page_likes: number;
    };
    const rows = (currentRes.data ?? []) as unknown as RawRow[];
    const prevRows = (prevRes.data ?? []) as unknown as RawRow[];

    // Aggregate helper
    function aggregate(data: RawRow[]) {
      const t = data.reduce(
        (acc, r) => {
          acc.spend += r.spend ?? 0;
          acc.reach += r.reach ?? 0;
          acc.impressions += r.impressions ?? 0;
          acc.clicks += r.inline_link_clicks ?? 0;
          acc.unique_clicks += r.unique_inline_link_clicks ?? 0;
          acc.purchases += r.purchases ?? 0;
          acc.revenue += r.purchase_value ?? 0;
          acc.leads += r.leads ?? 0;
          acc.messaging += r.messaging_conversations_started ?? 0;
          acc.post_shares += r.post_shares ?? 0;
          acc.page_likes += r.page_likes ?? 0;
          return acc;
        },
        {
          spend: 0,
          reach: 0,
          impressions: 0,
          clicks: 0,
          unique_clicks: 0,
          purchases: 0,
          revenue: 0,
          leads: 0,
          messaging: 0,
          post_shares: 0,
          page_likes: 0,
        },
      );
      const roas = t.spend > 0 ? t.revenue / t.spend : 0;
      const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
      const cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
      const cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
      const frequency = t.reach > 0 ? t.impressions / t.reach : 0;
      const cost_per_purchase = t.purchases > 0 ? t.spend / t.purchases : 0;
      const cost_per_lead = t.leads > 0 ? t.spend / t.leads : 0;
      const cost_per_message = t.messaging > 0 ? t.spend / t.messaging : 0;
      return {
        ...t,
        roas: parseFloat(roas.toFixed(2)),
        ctr: parseFloat(ctr.toFixed(2)),
        cpc: parseFloat(cpc.toFixed(2)),
        cpm: parseFloat(cpm.toFixed(2)),
        frequency: parseFloat(frequency.toFixed(2)),
        cost_per_purchase: parseFloat(cost_per_purchase.toFixed(2)),
        cost_per_lead: parseFloat(cost_per_lead.toFixed(2)),
        cost_per_message: parseFloat(cost_per_message.toFixed(2)),
      };
    }

    const totals = aggregate(rows);
    const prevTotals = aggregate(prevRows);

    // Override reach with accurate values from Facebook Insights API (same as sync-reach-summary)
    if (pageRes.error) throw pageRes.error;
    const allPages = (pageRes.data ?? []) as {
      account_id: string;
      account_name: string;
    }[];
    const filteredPages = account
      ? allPages.filter((p) => p.account_name === account)
      : allPages;
    const accountIds = filteredPages.map((p) => p.account_id);

    const accessToken = process.env.FB_ACCESS_TOKEN ?? "";
    let campaignReachMap = new Map<string, number>();
    if (accessToken && accountIds.length > 0 && dateFrom && dateTo) {
      const [reachCurrent, reachPrev, campaignReach] = await Promise.all([
        fetchAccountReach(accountIds, accessToken, dateFrom, dateTo),
        prevFrom
          ? fetchAccountReach(accountIds, accessToken, prevFrom, prevTo)
          : Promise.resolve(0),
        fetchCampaignReach(accountIds, accessToken, dateFrom, dateTo),
      ]);
      totals.reach = reachCurrent;
      prevTotals.reach = reachPrev;
      campaignReachMap = campaignReach;
      // Recompute frequency with updated reach
      totals.frequency =
        reachCurrent > 0
          ? parseFloat((totals.impressions / reachCurrent).toFixed(2))
          : 0;
      prevTotals.frequency =
        reachPrev > 0
          ? parseFloat((prevTotals.impressions / reachPrev).toFixed(2))
          : 0;
    }

    // Calculate % change for each metric: (current - prev) / prev * 100
    function pctChange(cur: number, prev: number): number | null {
      if (prev === 0) return cur > 0 ? 100 : null;
      return parseFloat((((cur - prev) / prev) * 100).toFixed(1));
    }

    const changes = {
      spend: pctChange(totals.spend, prevTotals.spend),
      reach: pctChange(totals.reach, prevTotals.reach),
      impressions: pctChange(totals.impressions, prevTotals.impressions),
      clicks: pctChange(totals.clicks, prevTotals.clicks),
      unique_clicks: pctChange(totals.unique_clicks, prevTotals.unique_clicks),
      purchases: pctChange(totals.purchases, prevTotals.purchases),
      revenue: pctChange(totals.revenue, prevTotals.revenue),
      roas: pctChange(totals.roas, prevTotals.roas),
      ctr: pctChange(totals.ctr, prevTotals.ctr),
      cpc: pctChange(totals.cpc, prevTotals.cpc),
      cpm: pctChange(totals.cpm, prevTotals.cpm),
      frequency: pctChange(totals.frequency, prevTotals.frequency),
      cost_per_purchase: pctChange(
        totals.cost_per_purchase,
        prevTotals.cost_per_purchase,
      ),
      cost_per_lead: pctChange(totals.cost_per_lead, prevTotals.cost_per_lead),
      cost_per_message: pctChange(
        totals.cost_per_message,
        prevTotals.cost_per_message,
      ),
      leads: pctChange(totals.leads, prevTotals.leads),
      messaging: pctChange(totals.messaging, prevTotals.messaging),
      post_shares: pctChange(totals.post_shares, prevTotals.post_shares),
      page_likes: pctChange(totals.page_likes, prevTotals.page_likes),
    };

    // Group by campaign_name/adset_name for table view
    type GroupKey = string;
    type GroupRow = {
      campaign_name: string;
      adset_name: string;
      spend: number;
      reach: number;
      impressions: number;
      clicks: number;
      unique_clicks: number;
      purchases: number;
      revenue: number;
      roas: number;
      ctr: number;
      cpc: number;
      cost_per_purchase: number;
      frequency: number;
    };

    const emptyRow = (campaign_name: string, adset_name: string): GroupRow => ({
      campaign_name,
      adset_name,
      spend: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      unique_clicks: 0,
      purchases: 0,
      revenue: 0,
      roas: 0,
      ctr: 0,
      cpc: 0,
      cost_per_purchase: 0,
      frequency: 0,
    });

    const grouped = new Map<GroupKey, GroupRow>();

    // Seed ALL known campaign+adset pairs (regardless of date range)
    if (!allPairsRes.error) {
      const seen = new Set<string>();
      for (const r of (allPairsRes.data ?? []) as {
        campaign_name: string;
        adset_name: string;
      }[]) {
        const key = `${r.campaign_name}|||${r.adset_name}`;
        if (!seen.has(key)) {
          seen.add(key);
          grouped.set(key, emptyRow(r.campaign_name, r.adset_name));
        }
      }
    }

    // Overlay actual aggregated data for the selected period
    for (const r of rows) {
      const key = `${r.campaign_name}|||${r.adset_name}`;
      if (!grouped.has(key)) {
        grouped.set(key, emptyRow(r.campaign_name, r.adset_name));
      }
      const g = grouped.get(key)!;
      g.spend += r.spend ?? 0;
      g.reach += r.reach ?? 0;
      g.impressions += r.impressions ?? 0;
      g.clicks += r.inline_link_clicks ?? 0;
      g.unique_clicks += r.unique_inline_link_clicks ?? 0;
      g.purchases += r.purchases ?? 0;
      g.revenue += r.purchase_value ?? 0;
    }

    const groupRows: GroupRow[] = [...grouped.values()].map((g) => {
      // Use accurate campaign-level reach from FB API if available
      const fbReach = campaignReachMap.get(g.campaign_name);
      const reach = fbReach !== undefined ? fbReach : g.reach;
      const frequency =
        reach > 0 ? parseFloat((g.impressions / reach).toFixed(2)) : 0;
      return {
        ...g,
        reach,
        roas: g.spend > 0 ? parseFloat((g.revenue / g.spend).toFixed(2)) : 0,
        ctr:
          g.impressions > 0
            ? parseFloat(((g.clicks / g.impressions) * 100).toFixed(2))
            : 0,
        cpc: g.clicks > 0 ? parseFloat((g.spend / g.clicks).toFixed(2)) : 0,
        cost_per_purchase:
          g.purchases > 0 ? parseFloat((g.spend / g.purchases).toFixed(2)) : 0,
        frequency,
      };
    });

    groupRows.sort((a, b) => b.spend - a.spend);

    return NextResponse.json({
      totals,
      changes,
      prevPeriod: prevFrom ? { from: prevFrom, to: prevTo } : null,
      rows: groupRows,
      count: rows.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
