import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  fetchAccountReach,
  fetchAgeGenderBreakdown,
  fetchDeviceBreakdown,
} from "@/lib/facebook";

// GET /api/dashboard?type=options
// GET /api/dashboard?type=data&dateFrom=&dateTo=&account=&campaign=&adset=
// GET /api/dashboard?type=geo&dateFrom=&dateTo=&account=&campaign=&adset=
// GET /api/dashboard?type=timeseries&dateFrom=&dateTo=&account=&campaign=&adset=
// GET /api/dashboard?type=demographics&dateFrom=&dateTo=&account=

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") ?? "data";

  // userId is injected by middleware (via x-user-id header).
  // x-user-role tells us if admin or user.
  const userId = request.headers.get("x-user-id");
  const userRole = request.headers.get("x-user-role");

  try {
    const supabase = getSupabase();

    // ── Resolve allowed account names for this user (or all for admin) ───────
    async function getAllowedAccountNames(): Promise<string[] | null> {
      if (userRole === "admin") return null; // admin sees everything
      if (!userId) return [];

      const { data: permData } = await supabase
        .from("ads_user_page_permissions")
        .select("account_id")
        .eq("user_id", userId);

      const allowedIds = (permData ?? []).map((r) => r.account_id as string);
      if (allowedIds.length === 0) return [];

      const { data: pageData } = await supabase
        .from("ads_allpage")
        .select("account_name")
        .in("account_id", allowedIds)
        .order("account_name");

      return (pageData ?? [])
        .map((r) => r.account_name as string)
        .filter(Boolean);
    }

    if (type === "highlights") {
      const campaign = searchParams.get("campaign") ?? "";
      let q = supabase
        .from("ads_campaign_highlights")
        .select("campaign_name, metric_key")
        .order("campaign_name");
      if (campaign) q = q.eq("campaign_name", campaign);

      const { data, error: hErr } = await q;
      if (hErr) throw hErr;

      const grouped: Record<string, string[]> = {};
      for (const row of data ?? []) {
        if (!grouped[row.campaign_name]) grouped[row.campaign_name] = [];
        grouped[row.campaign_name].push(row.metric_key);
      }
      return NextResponse.json({ highlights: grouped });
    }

    if (type === "options") {
      // Return distinct filter values (cascading)
      const account = searchParams.get("account") ?? "";
      const campaign = searchParams.get("campaign") ?? "";
      const dateFrom = searchParams.get("dateFrom") ?? "";
      const dateTo = searchParams.get("dateTo") ?? "";

      const allowedNames = await getAllowedAccountNames();

      // Account names from allpage table — filtered by user permissions (active only)
      let accountQuery = supabase
        .from("ads_allpage")
        .select("account_name")
        .eq("is_active", true)
        .order("account_name");
      if (allowedNames !== null && allowedNames.length > 0) {
        accountQuery = accountQuery.in("account_name", allowedNames);
      } else if (allowedNames !== null && allowedNames.length === 0) {
        // User has no permissions — return empty options
        return NextResponse.json({ accounts: [], campaigns: [], adsets: [] });
      }
      const { data: accountData, error: accountErr } = await accountQuery;
      if (accountErr) throw accountErr;
      const accounts = [
        ...new Set((accountData ?? []).map((r) => r.account_name as string)),
      ].filter(Boolean);

      // Fetch campaign+adset pairs with spend filter (only campaigns with spend > 0 in date range)
      let pairsData: { campaign_name: string; adset_name: string }[] = [];
      let q = supabase
        .from("ads_rawdata")
        .select("campaign_name,adset_name,spend");
      if (account) q = q.eq("account_name", account);
      else if (allowedNames !== null) q = q.in("account_name", allowedNames);
      if (dateFrom) q = q.gte("date_start", dateFrom);
      if (dateTo) q = q.lte("date_start", dateTo);

      const { data: rawPairs, error: pairsErr } = await q.limit(50000);
      if (pairsErr) throw pairsErr;

      // Filter pairs to only include campaigns/adsets with spend > 0
      const filteredPairs = (rawPairs ?? []).filter((r) => (r.spend ?? 0) > 0);
      pairsData = filteredPairs as {
        campaign_name: string;
        adset_name: string;
        spend: number;
      }[];

      const campaigns = [
        ...new Set((pairsData ?? []).map((r) => r.campaign_name as string)),
      ]
        .filter(Boolean)
        .sort();

      // Adsets: if campaign filter active, only show adsets under that campaign
      const adsetSource = campaign
        ? (pairsData ?? []).filter((r) => r.campaign_name === campaign)
        : (pairsData ?? []);
      const adsets = [
        ...new Set(adsetSource.map((r) => r.adset_name as string)),
      ]
        .filter(Boolean)
        .sort();

      return NextResponse.json({ accounts, campaigns, adsets });
    }

    // ── Helper: get filtered ad_ids from rawdata ─────────────────────────────
    async function getFilteredAdIds(
      dateFrom: string,
      dateTo: string,
      account: string,
      campaign: string,
      adset: string,
      allowedNames: string[] | null,
    ): Promise<string[] | null> {
      if (!account && !campaign && !adset && allowedNames === null) return null;
      let q = supabase.from("ads_rawdata").select("ad_id");
      if (account) q = q.eq("account_name", account);
      else if (allowedNames !== null) q = q.in("account_name", allowedNames);
      if (campaign) q = q.eq("campaign_name", campaign);
      if (adset) q = q.eq("adset_name", adset);
      if (dateFrom) q = q.gte("date_start", dateFrom);
      if (dateTo) q = q.lte("date_start", dateTo);
      const { data: adData } = await q.limit(50000);
      return [...new Set((adData ?? []).map((r) => r.ad_id as string))];
    }

    // ── type === "timeseries" — daily CPM + impressions for combo chart ──────
    if (type === "timeseries") {
      const dateFrom = searchParams.get("dateFrom") ?? "";
      const dateTo = searchParams.get("dateTo") ?? "";
      const account = searchParams.get("account") ?? "";
      const campaign = searchParams.get("campaign") ?? "";
      const adset = searchParams.get("adset") ?? "";

      const allowedNames = await getAllowedAccountNames();
      if (allowedNames !== null && allowedNames.length === 0) {
        return NextResponse.json({ series: [] });
      }

      let q = supabase
        .from("ads_rawdata")
        .select(
          "date_start,spend,impressions,inline_link_clicks,unique_inline_link_clicks,clicks_all,messaging_conversations_started,post_engagement,reach,leads",
        )
        .order("date_start", { ascending: true });
      if (dateFrom) q = q.gte("date_start", dateFrom);
      if (dateTo) q = q.lte("date_start", dateTo);
      if (account) q = q.eq("account_name", account);
      else if (allowedNames !== null) q = q.in("account_name", allowedNames);
      if (campaign) q = q.eq("campaign_name", campaign);
      if (adset) q = q.eq("adset_name", adset);

      const { data: tsData, error: tsErr } = await q.limit(50000);
      if (tsErr) throw tsErr;

      // Aggregate by date
      const dayMap = new Map<
        string,
        {
          spend: number;
          impressions: number;
          inline_link_clicks: number;
          unique_inline_link_clicks: number;
          clicks_all: number;
          messaging: number;
          post_engagement: number;
          reach: number;
          leads: number;
        }
      >();
      let totalImpressions = 0;
      for (const r of (tsData ?? []) as {
        date_start: string;
        spend: number;
        impressions: number;
        inline_link_clicks: number;
        unique_inline_link_clicks: number;
        clicks_all: number;
        messaging_conversations_started: number;
        post_engagement: number;
        reach: number;
        leads: number;
      }[]) {
        const d = r.date_start;
        if (!dayMap.has(d))
          dayMap.set(d, {
            spend: 0,
            impressions: 0,
            inline_link_clicks: 0,
            unique_inline_link_clicks: 0,
            clicks_all: 0,
            messaging: 0,
            post_engagement: 0,
            reach: 0,
            leads: 0,
          });
        const agg = dayMap.get(d)!;
        agg.spend += r.spend ?? 0;
        agg.impressions += r.impressions ?? 0;
        agg.inline_link_clicks += r.inline_link_clicks ?? 0;
        agg.unique_inline_link_clicks += r.unique_inline_link_clicks ?? 0;
        agg.clicks_all += r.clicks_all ?? 0;
        agg.messaging += r.messaging_conversations_started ?? 0;
        agg.post_engagement += r.post_engagement ?? 0;
        agg.reach += r.reach ?? 0;
        agg.leads += r.leads ?? 0;
        totalImpressions += r.impressions ?? 0;
      }

      // Fetch total reach from API and allocate proportionally to each day
      let totalReachFromAPI = 0;
      try {
        let pageQuery = supabase
          .from("ads_allpage")
          .select("account_id, account_name");
        if (account) {
          pageQuery = pageQuery.eq("account_name", account);
        } else if (allowedNames !== null) {
          pageQuery = pageQuery.in("account_name", allowedNames);
        }
        const { data: pageData } = await pageQuery;
        const accountIds = (pageData ?? []).map((r) => r.account_id as string);

        const accessToken = process.env.FB_ACCESS_TOKEN ?? "";
        if (accessToken && accountIds.length > 0 && dateFrom && dateTo) {
          totalReachFromAPI = await fetchAccountReach(
            accountIds,
            accessToken,
            dateFrom,
            dateTo,
          );
        }
      } catch (err) {
        console.error("fetchAccountReach in timeseries failed:", err);
        // Continue with reach from database if API fails
      }

      const series = [...dayMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => {
          // Allocate total reach from API proportionally based on daily impressions
          const reachShare =
            totalImpressions > 0
              ? parseFloat(
                  (
                    (v.impressions / totalImpressions) *
                    totalReachFromAPI
                  ).toFixed(0),
                )
              : 0;
          return {
            date,
            spend: parseFloat(v.spend.toFixed(2)),
            impressions: v.impressions,
            cpm:
              v.impressions > 0
                ? parseFloat(((v.spend / v.impressions) * 1000).toFixed(2))
                : 0,
            inline_link_clicks: v.inline_link_clicks,
            unique_inline_link_clicks: v.unique_inline_link_clicks,
            cpc:
              v.inline_link_clicks > 0
                ? parseFloat((v.spend / v.inline_link_clicks).toFixed(2))
                : 0,
            messaging: v.messaging,
            cost_per_message:
              v.messaging > 0
                ? parseFloat((v.spend / v.messaging).toFixed(2))
                : 0,
            post_engagement: v.post_engagement,
            cost_per_engagement:
              v.post_engagement > 0
                ? parseFloat((v.spend / v.post_engagement).toFixed(2))
                : 0,
            reach: reachShare,
            leads: v.leads,
          };
        });

      return NextResponse.json({ series });
    }

    // ── type === "demographics" — age/gender + device breakdown ────────────
    if (type === "demographics") {
      const dateFrom = searchParams.get("dateFrom") ?? "";
      const dateTo = searchParams.get("dateTo") ?? "";
      const account = searchParams.get("account") ?? "";

      const allowedNames = await getAllowedAccountNames();
      if (allowedNames !== null && allowedNames.length === 0) {
        return NextResponse.json({ ageGender: [], devices: [] });
      }

      // Resolve account IDs
      let pageQuery = supabase
        .from("ads_allpage")
        .select("account_id, account_name");
      if (account) pageQuery = pageQuery.eq("account_name", account);
      else if (allowedNames !== null)
        pageQuery = pageQuery.in("account_name", allowedNames);

      const { data: pageData } = await pageQuery;
      const accountIds = (pageData ?? []).map((r) => r.account_id as string);

      const accessToken = process.env.FB_ACCESS_TOKEN ?? "";
      if (!accessToken || accountIds.length === 0 || !dateFrom || !dateTo) {
        return NextResponse.json({ ageGender: [], devices: [] });
      }

      const [ageGender, devices] = await Promise.all([
        fetchAgeGenderBreakdown(accountIds, accessToken, dateFrom, dateTo),
        fetchDeviceBreakdown(accountIds, accessToken, dateFrom, dateTo),
      ]);

      return NextResponse.json({ ageGender, devices });
    }

    // ── type === "geo" — region breakdown for GeoChart (reach from API, rest from DB) ──
    if (type === "geo") {
      const dateFrom = searchParams.get("dateFrom") ?? "";
      const dateTo = searchParams.get("dateTo") ?? "";
      const account = searchParams.get("account") ?? "";
      const campaign = searchParams.get("campaign") ?? "";
      const adset = searchParams.get("adset") ?? "";

      // If no dates provided, return empty regions
      if (!dateFrom || !dateTo) {
        return NextResponse.json({ regions: [] });
      }

      const allowedNames = await getAllowedAccountNames();
      if (allowedNames !== null && allowedNames.length === 0) {
        return NextResponse.json({ regions: [] });
      }

      const adIdFilter = await getFilteredAdIds(
        dateFrom,
        dateTo,
        account,
        campaign,
        adset,
        allowedNames,
      );
      if (adIdFilter !== null && adIdFilter.length === 0) {
        return NextResponse.json({ regions: [] });
      }

      // Query ads_geo grouped by region from database
      let geoQuery = supabase
        .from("ads_geo")
        .select(
          "region,inline_link_clicks,spend,impressions,purchases,purchase_value",
        );
      if (dateFrom) geoQuery = geoQuery.gte("date_start", dateFrom);
      if (dateTo) geoQuery = geoQuery.lte("date_start", dateTo);
      if (adIdFilter) geoQuery = geoQuery.in("ad_id", adIdFilter);

      const { data: geoData, error: geoErr } = await geoQuery.limit(50000);
      if (geoErr) throw geoErr;

      // Aggregate by region from database
      const regionMap = new Map<
        string,
        {
          region: string;
          inline_link_clicks: number;
          spend: number;
          impressions: number;
          reach: number;
          purchases: number;
          purchase_value: number;
        }
      >();

      for (const r of (geoData ?? []) as {
        region: string;
        inline_link_clicks: number;
        spend: number;
        impressions: number;
        purchases: number;
        purchase_value: number;
      }[]) {
        const key = r.region || "Unknown";
        if (!regionMap.has(key)) {
          regionMap.set(key, {
            region: key,
            inline_link_clicks: 0,
            spend: 0,
            impressions: 0,
            reach: 0,
            purchases: 0,
            purchase_value: 0,
          });
        }
        const agg = regionMap.get(key)!;
        agg.inline_link_clicks += r.inline_link_clicks ?? 0;
        agg.spend += r.spend ?? 0;
        agg.impressions += r.impressions ?? 0;
        agg.purchases += r.purchases ?? 0;
        agg.purchase_value += r.purchase_value ?? 0;
      }

      // Get total reach from API (for account-level, not per-region)
      let totalReachForAllocation = 0;
      try {
        let pageQuery = supabase
          .from("ads_allpage")
          .select("account_id, account_name");
        if (account) {
          pageQuery = pageQuery.eq("account_name", account);
        } else if (allowedNames !== null) {
          pageQuery = pageQuery.in("account_name", allowedNames);
        }
        const { data: pageData } = await pageQuery;
        const accountIds = (pageData ?? []).map((r) => r.account_id as string);

        const accessToken = process.env.FB_ACCESS_TOKEN ?? "";
        if (accessToken && accountIds.length > 0) {
          totalReachForAllocation = await fetchAccountReach(
            accountIds,
            accessToken,
            dateFrom,
            dateTo,
          );
        }
      } catch (err) {
        console.error("fetchAccountReach in geo failed:", err);
        // Continue with database reach if API fails
      }

      // Allocate total reach proportionally to each region based on impressions
      let totalRegionImpressions = 0;
      for (const [_, data] of regionMap.entries()) {
        totalRegionImpressions += data.impressions ?? 0;
      }

      for (const [region, data] of regionMap.entries()) {
        // If we got reach from API, allocate proportionally; otherwise use database reach
        if (totalReachForAllocation > 0 && totalRegionImpressions > 0) {
          data.reach = parseFloat(
            (
              (data.impressions / totalRegionImpressions) *
              totalReachForAllocation
            ).toFixed(0),
          );
        }
        // else keep reach as 0 (from database, which also defaults to 0)
      }

      const regions = [...regionMap.values()].sort((a, b) => b.spend - a.spend);

      return NextResponse.json({ regions });
    }

    // type === "data" — aggregate rows with filters
    const dateFrom = searchParams.get("dateFrom") ?? "";
    const dateTo = searchParams.get("dateTo") ?? "";
    const account = searchParams.get("account") ?? "";
    const campaign = searchParams.get("campaign") ?? "";
    const adset = searchParams.get("adset") ?? "";

    // Resolve allowed accounts for user (null = admin, can see all)
    const allowedNames = await getAllowedAccountNames();
    if (allowedNames !== null && allowedNames.length === 0) {
      // User has no permissions — return empty response
      return NextResponse.json({
        totals: null,
        changes: null,
        rows: [],
        count: 0,
        prevPeriod: null,
      });
    }

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
      "spend,reach,impressions,inline_link_clicks,unique_inline_link_clicks,clicks_all," +
      "purchases,purchase_value,cpc,ctr,cpm,frequency," +
      "leads,messaging_conversations_started,post_shares,page_likes," +
      "post_engagement,cost_per_engagement,cost_per_like";

    function buildQuery(from: string, to: string) {
      let q = supabase
        .from("ads_rawdata")
        .select(selectFields)
        .order("date_start", { ascending: false });
      if (from) q = q.gte("date_start", from);
      if (to) q = q.lte("date_start", to);
      // Apply account filter — use explicit account param or fall back to allowed list
      if (account) {
        q = q.eq("account_name", account);
      } else if (allowedNames !== null) {
        q = q.in("account_name", allowedNames);
      }
      if (campaign) q = q.eq("campaign_name", campaign);
      if (adset) q = q.eq("adset_name", adset);
      return q.limit(50000);
    }

    // Fetch current + previous period data + account IDs + all campaign/adset pairs in parallel
    let pageQuery = supabase
      .from("ads_allpage")
      .select("account_id, account_name");
    if (allowedNames !== null) {
      pageQuery = pageQuery.in("account_name", allowedNames);
    }

    const [currentRes, prevRes, pageRes, allPairsRes] = await Promise.all([
      buildQuery(dateFrom, dateTo),
      prevFrom
        ? buildQuery(prevFrom, prevTo)
        : Promise.resolve({ data: [], error: null }),
      pageQuery.then((r) => r),
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
      clicks_all: number;
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
      post_engagement: number;
      cost_per_engagement: number;
      cost_per_like: number;
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
          acc.clicks_all += r.clicks_all ?? 0;
          acc.purchases += r.purchases ?? 0;
          acc.revenue += r.purchase_value ?? 0;
          acc.leads += r.leads ?? 0;
          acc.messaging += r.messaging_conversations_started ?? 0;
          acc.post_shares += r.post_shares ?? 0;
          acc.page_likes += r.page_likes ?? 0;
          acc.post_engagement += r.post_engagement ?? 0;
          return acc;
        },
        {
          spend: 0,
          reach: 0,
          impressions: 0,
          clicks: 0,
          unique_clicks: 0,
          clicks_all: 0,
          purchases: 0,
          revenue: 0,
          leads: 0,
          messaging: 0,
          post_shares: 0,
          page_likes: 0,
          post_engagement: 0,
        },
      );
      const roas = t.spend > 0 ? t.revenue / t.spend : 0;
      const ctr = t.impressions > 0 ? (t.clicks_all / t.impressions) * 100 : 0;
      const cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
      const cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
      const frequency = t.reach > 0 ? t.impressions / t.reach : 0;
      const cost_per_purchase = t.purchases > 0 ? t.spend / t.purchases : 0;
      const cost_per_lead = t.leads > 0 ? t.spend / t.leads : 0;
      const cost_per_message = t.messaging > 0 ? t.spend / t.messaging : 0;
      const cost_per_engagement =
        t.post_engagement > 0 ? t.spend / t.post_engagement : 0;
      const cost_per_like = t.page_likes > 0 ? t.spend / t.page_likes : 0;
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
        cost_per_engagement: parseFloat(cost_per_engagement.toFixed(2)),
        cost_per_like: parseFloat(cost_per_like.toFixed(2)),
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
    if (accessToken && accountIds.length > 0 && dateFrom && dateTo) {
      const [reachCurrent, reachPrev] = await Promise.all([
        fetchAccountReach(accountIds, accessToken, dateFrom, dateTo),
        prevFrom
          ? fetchAccountReach(accountIds, accessToken, prevFrom, prevTo)
          : Promise.resolve(0),
      ]);
      // Use API reach for totals only (account-level unique reach)
      // Campaign breakdown will use database reach to avoid overlap issues
      totals.reach = reachCurrent;
      prevTotals.reach = reachPrev;
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
      post_engagement: pctChange(
        totals.post_engagement,
        prevTotals.post_engagement,
      ),
      cost_per_engagement: pctChange(
        totals.cost_per_engagement,
        prevTotals.cost_per_engagement,
      ),
      cost_per_like: pctChange(totals.cost_per_like, prevTotals.cost_per_like),
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
      clicks_all: number;
      purchases: number;
      revenue: number;
      roas: number;
      ctr: number;
      cpc: number;
      cost_per_purchase: number;
      frequency: number;
      page_likes: number;
      post_engagement: number;
      cost_per_engagement: number;
      cost_per_like: number;
    };

    const emptyRow = (campaign_name: string, adset_name: string): GroupRow => ({
      campaign_name,
      adset_name,
      spend: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      unique_clicks: 0,
      clicks_all: 0,
      purchases: 0,
      revenue: 0,
      roas: 0,
      ctr: 0,
      cpc: 0,
      cost_per_purchase: 0,
      frequency: 0,
      page_likes: 0,
      post_engagement: 0,
      cost_per_engagement: 0,
      cost_per_like: 0,
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
      g.clicks_all += r.clicks_all ?? 0;
      g.purchases += r.purchases ?? 0;
      g.revenue += r.purchase_value ?? 0;
      g.page_likes += r.page_likes ?? 0;
      g.post_engagement += r.post_engagement ?? 0;
    }

    const groupRows: GroupRow[] = [...grouped.values()].map((g) => {
      // Allocate total reach to campaigns proportionally based on their impressions
      // This ensures campaign reach sums up to match the top card reach
      const reachShare =
        totals.impressions > 0
          ? parseFloat(
              ((g.impressions / totals.impressions) * totals.reach).toFixed(0),
            )
          : 0;
      const frequency =
        reachShare > 0
          ? parseFloat((g.impressions / reachShare).toFixed(2))
          : 0;
      return {
        ...g,
        reach: reachShare,
        roas: g.spend > 0 ? parseFloat((g.revenue / g.spend).toFixed(2)) : 0,
        ctr:
          g.impressions > 0
            ? parseFloat(((g.clicks_all / g.impressions) * 100).toFixed(2))
            : 0,
        cpc: g.clicks > 0 ? parseFloat((g.spend / g.clicks).toFixed(2)) : 0,
        cost_per_purchase:
          g.purchases > 0 ? parseFloat((g.spend / g.purchases).toFixed(2)) : 0,
        frequency,
        post_engagement: g.post_engagement,
        cost_per_engagement:
          g.post_engagement > 0
            ? parseFloat((g.spend / g.post_engagement).toFixed(2))
            : 0,
        cost_per_like:
          g.page_likes > 0
            ? parseFloat((g.spend / g.page_likes).toFixed(2))
            : 0,
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
