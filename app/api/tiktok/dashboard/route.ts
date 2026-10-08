/**
 * app/api/tiktok/dashboard/route.ts
 * GET /api/tiktok/dashboard
 *
 * Query params:
 *   advertiser_id  – optional, comma-separated IDs to filter
 *   date_from      – optional, "YYYY-MM-DD"
 *   date_to        – optional, "YYYY-MM-DD"
 *
 * Returns:
 *   totals          – aggregated scorecards
 *   by_ad           – per-ad rows with quadrant
 *   advertisers     – list of all known advertisers
 *   daily_timeline  – per-day rows (videos/likes/follows)
 *   weekly_engagement – mon..sun engagement totals
 *   videos_daily    – per-day video view stacks (total/2s/6s/50/100)
 *   cost_distribution – spend by objective category (Reach / Video View / Community)
 *   audience_gender – gender breakdown
 *   audience_age    – age group breakdown
 *   audience_provinces – province breakdown (TH)
 *   audience_occupations – occupation breakdown (F12, ⚠ unverified dimension)
 *   restricted_metrics – report metrics blocked by permission_denied (EC4)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { computeAdMetrics } from "@/lib/tiktok-metrics";
import { fetchDedupedReach, applyDedupedReachToAds, fetchAudienceInterests, formatTikTokError } from "@/lib/tiktok-ads";

type Row = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const { searchParams } = req.nextUrl;

  const advertiserIds = searchParams.get("advertiser_id");
  // F19: default to the last 30 days so "% change" always has a period to
  // compare against, even when the caller sends no date filter at all.
  const defaultTo = new Date();
  defaultTo.setUTCDate(defaultTo.getUTCDate() - 1);
  const defaultFrom = new Date(defaultTo);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const dateFrom = searchParams.get("date_from") ?? defaultFrom.toISOString().slice(0, 10);
  const dateTo = searchParams.get("date_to") ?? defaultTo.toISOString().slice(0, 10);

  let advFilter = advertiserIds
    ? advertiserIds.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  // Per-user advertiser visibility (same idea as ads_user_page_permissions
  // on the Facebook side) — Viewer only sees advertisers an admin granted;
  // admin sees everything. Headers set by middleware.ts on this route.
  // Every query below already gates on `advFilter` when non-null/non-empty,
  // so narrowing it here alone would be enough EXCEPT: an empty array reads
  // as "no filter" everywhere else in this file (`advFilter.length > 0`),
  // which for a Viewer with zero grants would mean "show every advertiser"
  // — the opposite of what an empty allow-list should mean. A sentinel id
  // that can never match keeps every existing `.in()` check working as a
  // real (zero-result) filter instead of special-casing "empty" at 8 call
  // sites.
  const userRole = req.headers.get("x-user-role");
  let allowedAdvertiserIds: string[] | null = null; // null = admin, no restriction
  if (userRole !== "admin") {
    const userId = req.headers.get("x-user-id");
    const { data: allowedRows } = userId
      ? await sb.from("tiktok_user_advertiser_permissions").select("advertiser_id").eq("user_id", userId)
      : { data: [] as { advertiser_id: string }[] };
    allowedAdvertiserIds = (allowedRows ?? []).map((r) => r.advertiser_id);
    const combined = advFilter ? advFilter.filter((id) => allowedAdvertiserIds!.includes(id)) : allowedAdvertiserIds;
    advFilter = combined.length > 0 ? combined : ["__no_tiktok_access__"];
  }

  // ── Main rawdata query ────────────────────────────────────────────────────
  let query = sb
    .from("tiktok_ads_rawdata")
    .select(
      [
        "advertiser_id",
        "advertiser_name",
        "campaign_id",
        "campaign_name",
        "adgroup_name",
        "ad_id",
        "ad_name",
        "stat_time_day",
        "objective_type",
        "spend",
        "impressions",
        "reach",
        "video_views",
        "video_watched_2s",
        "video_watched_6s",
        "video_view_p50",
        "video_view_p100",
        "likes",
        "comments",
        "shares",
        "follows",
        "clicks",
        "average_video_play",
      ].join(","),
    )
    .order("stat_time_day", { ascending: true });

  if (advFilter && advFilter.length > 0) query = query.in("advertiser_id", advFilter);
  if (dateFrom) query = query.gte("stat_time_day", dateFrom);
  if (dateTo) query = query.lte("stat_time_day", dateTo);

  const { data: rawRows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (rawRows ?? []) as unknown as Row[];

  // ── Totals (scorecards) ───────────────────────────────────────────────────
  const totals = computeTotals(rows);

  // ── MoM comparison (F16): previous period of the *same* length,
  //    immediately before dateFrom. If the account's data doesn't reach
  //    back that far, say so instead of silently comparing against a
  //    shorter/empty window.
  const periodDays = daysBetween(dateFrom, dateTo) + 1;
  const prevTo = addDays(dateFrom, -1);
  const prevFrom = addDays(prevTo, -(periodDays - 1));

  let prevQuery = sb
    .from("tiktok_ads_rawdata")
    .select("spend,impressions,reach,video_views,video_watched_2s,video_watched_6s,video_view_p50,video_view_p100,likes,comments,shares,follows,clicks,average_video_play,stat_time_day,advertiser_id,ad_id")
    .gte("stat_time_day", prevFrom)
    .lte("stat_time_day", prevTo);
  if (advFilter && advFilter.length > 0) prevQuery = prevQuery.in("advertiser_id", advFilter);
  const { data: prevRawRows } = await prevQuery;
  const prevRows = (prevRawRows ?? []) as unknown as Row[];
  const prevTotals = computeTotals(prevRows);

  // ── Reach, fetched live instead of summed ────────────────────────────────
  // computeTotals adds reach up across per-ad per-day rows, which counts the
  // same person once per ad per day and inflates the figure badly. reach is
  // the one stored metric that can't be aggregated locally at all, so it is
  // asked of TikTok for the exact selected range — see fetchDedupedReach.
  //
  // Never fatal: a TikTok outage, rate limit or permission problem must not
  // take the whole dashboard down, so the old summed figure stays as the
  // fallback and reach_source says which one the numbers came from.
  const advertiserIdsOf = (list: Row[]) =>
    [...new Set(list.map((r) => String(r.advertiser_id ?? "")).filter(Boolean))];
  let reachSource: "api_deduped" | "summed_fallback" = "api_deduped";
  try {
    const [currentReach, previousReach] = await Promise.all([
      fetchDedupedReach(advertiserIdsOf(rows), dateFrom, dateTo),
      fetchDedupedReach(advertiserIdsOf(prevRows), prevFrom, prevTo),
    ]);
    totals.reach = currentReach;
    prevTotals.reach = previousReach;
  } catch (err) {
    reachSource = "summed_fallback";
    console.error("[tiktok/dashboard] deduped reach fetch failed, falling back to summed rows:", formatTikTokError(err));
  }

  const pctChange = (curr: number, prev: number): number | null =>
    prev > 0 ? round2(((curr - prev) / prev) * 100) : null;

  const prevVideoCount = new Set(prevRows.map((r) => String(r.ad_id ?? "")).filter(Boolean)).size;

  const momChange = {
    spend: pctChange(totals.spend, prevTotals.spend),
    impressions: pctChange(totals.impressions, prevTotals.impressions),
    video_views: pctChange(totals.video_views, prevTotals.video_views),
    view_50_rate: pctChange(totals.view_50_rate, prevTotals.view_50_rate),
    avg_watch_time: pctChange(totals.avg_watch_time, prevTotals.avg_watch_time),
    cpm: pctChange(totals.cpm, prevTotals.cpm),
    cpc: pctChange(totals.cpc, prevTotals.cpc),
    reach: pctChange(totals.reach, prevTotals.reach),
    likes: pctChange(totals.likes, prevTotals.likes),
    comments: pctChange(totals.comments, prevTotals.comments),
    shares: pctChange(totals.shares, prevTotals.shares),
    follows: pctChange(totals.follows, prevTotals.follows),
  };

  // ── Per-ad aggregation + F17 quadrant classification (shared with the CSV
  //    export route so both report the exact same numbers) ──────────────────
  const { data: quadrantSettingsRow } = await sb
    .from("tiktok_quadrant_settings")
    .select("spend_threshold, rate_threshold")
    .eq("id", 1)
    .maybeSingle();

  const { byAd, spendThreshold, rateThreshold } = computeAdMetrics(rows, quadrantSettingsRow);
  // Same "reach can't be summed" fix as the account-level tile above, one
  // level down: byAd's reach came from summing per-ad-per-day rows, which
  // overcounts anyone the ad reached on more than one day. Overwritten in
  // place with TikTok's own deduped figure per ad where the live call
  // succeeds; best-effort, so a hiccup here leaves the summed (inflated)
  // value rather than breaking the table.
  await applyDedupedReachToAds(byAd, advertiserIdsOf(rows), dateFrom, dateTo);

  // Creative thumbnails + video meta (caption/create_time/duration — best-effort, see lib/tiktok-ads.ts fetchAdCreatives)
  const adIds = byAd.map((a) => a.ad_id).filter(Boolean);
  const creativeMap = new Map<
    string,
    { video_cover_url: string | null; caption: string | null; create_time: string | null; duration: number | null; tiktok_item_id: string | null }
  >();
  if (adIds.length > 0) {
    const { data: creativeRows } = await sb
      .from("tiktok_ad_creatives")
      .select("ad_id, video_cover_url, caption, create_time, duration, tiktok_item_id")
      .in("ad_id", adIds);
    for (const c of creativeRows ?? []) {
      creativeMap.set(c.ad_id, {
        video_cover_url: c.video_cover_url ?? null,
        caption: c.caption ?? null,
        create_time: c.create_time ?? null,
        duration: c.duration ?? null,
        tiktok_item_id: c.tiktok_item_id ?? null,
      });
    }
  }
  // Spark Ads (most ads in this account) have no video_cover_url — link
  // straight to the real video via TikTok's oEmbed URL instead.
  const videoLink = (itemId: string | null) => (itemId ? `https://www.tiktok.com/embed/v2/${itemId}` : null);

  const byAdWithCover = byAd.map((a) => ({
    ...a,
    video_cover_url: creativeMap.get(a.ad_id)?.video_cover_url ?? null,
    video_link: videoLink(creativeMap.get(a.ad_id)?.tiktok_item_id ?? null),
  }));

  // ── Best Videos leaderboard ────────────────────────────────────────────────
  // Grouped by the POST (tiktok_item_id), not by ad. One video is routinely
  // boosted by several ads — item 7537281223924747527 runs under three ad_ids
  // — so grouping by ad listed the same video three times.
  //
  // Deliberately LIFETIME and NOT date-filtered, on both halves. The organic
  // side (tiktok_post_totals) is each post's running total since it was
  // published — the source reports nothing else. Filtering the paid half by
  // the dashboard's date range while the organic half covers all time would
  // make organic (total − paid) read far too high: The Athenee's post has
  // ~262k lifetime views against ~248k paid impressions in a 30-day window
  // alone. The UI says so under the table.
  const { data: postRows, error: postErr } = await sb
    .from("tiktok_post_totals")
    .select("item_id, caption, thumbnail_url, share_url, create_time, video_views, likes, comments, shares")
    .order("video_views", { ascending: false })
    .limit(50);
  if (postErr) console.error("[tiktok/dashboard] tiktok_post_totals read failed (non-fatal):", postErr.message);

  let bestVideos;
  // Summed across EVERY boosted-or-not post the organic sync knows about,
  // not just the top 10 shown in Best Videos — an Overview-level total needs
  // the whole set, and bestVideos is deliberately capped for the table.
  // null when there is no organic data at all (same condition as the
  // paid-only fallback below), so the UI can tell "nothing to show yet"
  // from "everything is zero".
  let videoEngagementSummary: {
    post_count: number;
    prev_post_count: number;
    views: { total: number; paid: number; organic: number };
    likes: { total: number; paid: number; organic: number };
    shares: { total: number; paid: number; organic: number };
    comments: { total: number; paid: number; organic: number };
  } | null = null;
  if (postRows && postRows.length > 0) {
    // Which ads ran each post, and what they spent over their whole life.
    const itemIds = postRows.map((p) => p.item_id);
    let creativeQuery = sb
      .from("tiktok_ad_creatives")
      .select("ad_id, advertiser_id, tiktok_item_id, video_cover_url")
      .in("tiktok_item_id", itemIds);
    if (advFilter && advFilter.length > 0) creativeQuery = creativeQuery.in("advertiser_id", advFilter);
    const { data: itemCreatives } = await creativeQuery;

    const adToItem = new Map<string, string>();
    const itemCover = new Map<string, string>();
    for (const c of itemCreatives ?? []) {
      if (c.tiktok_item_id) {
        adToItem.set(c.ad_id, c.tiktok_item_id);
        if (c.video_cover_url && !itemCover.has(c.tiktok_item_id)) itemCover.set(c.tiktok_item_id, c.video_cover_url);
      }
    }

    // Paid views per post, summed over every day those ads ever ran — no
    // date filter, to match the lifetime organic figures above.
    const paidByItem = new Map<string, { views: number; likes: number; comments: number; shares: number }>();
    const boostedAdIds = [...adToItem.keys()];
    if (boostedAdIds.length > 0) {
      const { data: paidRows } = await sb
        .from("tiktok_ads_rawdata")
        .select("ad_id, video_views, likes, comments, shares")
        .in("ad_id", boostedAdIds);
      for (const r of paidRows ?? []) {
        const itemId = adToItem.get(String(r.ad_id));
        if (!itemId) continue;
        const acc = paidByItem.get(itemId) ?? { views: 0, likes: 0, comments: 0, shares: 0 };
        acc.views += num(r.video_views);
        acc.likes += num(r.likes);
        acc.comments += num(r.comments);
        acc.shares += num(r.shares);
        paidByItem.set(itemId, acc);
      }
    }

    // Each metric is reported as its total with the paid and organic parts
    // beneath, so one cell answers "how did this post do" and "how much of
    // that did we buy" at once.
    //
    // paid is null, never 0, when no ad ever ran on the post: "nothing was
    // spent here" and "we spent and it delivered nothing" are different
    // answers and only one of them is a problem. organic then IS the total.
    //
    // Not clamped at 0. Paid can exceed the post's own total — the ads report
    // and the post report settle on different schedules — and a negative
    // remainder is the signal that they have drifted, which a floor would
    // quietly swallow.
    const split = (total: number, paid: number | null) => ({
      total,
      paid,
      organic: paid === null ? total : total - paid,
    });

    const allPosts = postRows.map((p) => {
      const paid = paidByItem.get(p.item_id) ?? null;
      return {
        item_id: p.item_id,
        caption: p.caption ?? null,
        create_time: p.create_time ?? null,
        // Ad-side cover first, not organic second: itemCover comes from
        // tiktok_ad_creatives, which the main TikTok sync re-hosts to a
        // permanent Supabase URL on every run (lib/tiktok-ads.ts's
        // persistThumbnail) — it never goes dead once set. p.thumbnail_url
        // is Windsor's signed TikTok URL, which expires in ~2 days and only
        // gets re-hosted for posts Windsor still returns (see sync-windsor's
        // catch-up pass) or refreshed via TikTok's public oEmbed, which can
        // itself be rate-limited. `??` picked whichever was non-null, so a
        // dead-but-non-null organic URL always won over a live ad-side one
        // that was sitting right there — confirmed live: the #1 Best Video
        // had exactly this, a working ad cover ignored in favor of a 403.
        video_cover_url: itemCover.get(p.item_id) ?? p.thumbnail_url ?? null,
        video_link: p.share_url ?? videoLink(p.item_id),
        views: split(num(p.video_views), paid ? paid.views : null),
        likes: split(num(p.likes), paid ? paid.likes : null),
        shares: split(num(p.shares), paid ? paid.shares : null),
        comments: split(num(p.comments), paid ? paid.comments : null),
      };
    });

    // Scoped to posts PUBLISHED within the selected range, not to when the
    // engagement happened — organic engagement has no daily dimension to
    // filter by (see the header comment above), but create_time is a real
    // per-post date, so "videos posted this month" is answerable even
    // though "views earned this month" is not. Each included post still
    // contributes its full lifetime total, same as before; only which
    // posts are counted changes.
    const postsInRange = allPosts.filter((p) => {
      if (!p.create_time) return false; // unknown publish date — can't place it in the range
      const day = String(p.create_time).slice(0, 10);
      return day >= dateFrom && day <= dateTo;
    });
    // Same idea, previous period — gives the "Videos Posted" KPI tile a real
    // month-over-month comparison instead of being the one count tile with
    // no history, matching every other tile on the page.
    const prevPostsInRange = allPosts.filter((p) => {
      if (!p.create_time) return false;
      const day = String(p.create_time).slice(0, 10);
      return day >= prevFrom && day <= prevTo;
    }).length;

    // null-paid (never boosted) contributes 0 to the paid sum and its whole
    // total to organic — consistent with how a single post's own organic
    // figure is read when it was never boosted.
    const sumSplit = (key: "views" | "likes" | "shares" | "comments") => {
      const total = postsInRange.reduce((sum, r) => sum + r[key].total, 0);
      const paid = postsInRange.reduce((sum, r) => sum + (r[key].paid ?? 0), 0);
      return { total, paid, organic: total - paid };
    };
    videoEngagementSummary = {
      post_count: postsInRange.length,
      prev_post_count: prevPostsInRange,
      views: sumSplit("views"),
      likes: sumSplit("likes"),
      shares: sumSplit("shares"),
      comments: sumSplit("comments"),
    };

    // Best Videos stays scoped to every post regardless of publish date —
    // it's a lifetime leaderboard, a different question from "what was
    // posted this month", and wasn't asked to change.
    bestVideos = [...allPosts].sort((a, b) => b.views.total - a.views.total).slice(0, 10);
  } else {
    // No organic data yet (tables not created, or the sync hasn't run) — the
    // previous paid-only leaderboard, so the table never goes blank.
    bestVideos = [...byAd]
      .filter((a) => a.video_views > 0)
      .sort((a, b) => b.video_views - a.video_views)
      .slice(0, 10)
      .map((a) => {
        const meta = creativeMap.get(a.ad_id);
        // Paid-only source, so organic is unknown rather than zero — the
        // whole point of the organic column is that this branch has no
        // access to it.
        const paidOnly = (v: number) => ({ total: v, paid: v, organic: null });
        return {
          item_id: meta?.tiktok_item_id ?? a.ad_id,
          caption: meta?.caption ?? a.ad_name ?? null,
          create_time: meta?.create_time ?? null,
          video_cover_url: meta?.video_cover_url ?? null,
          video_link: videoLink(meta?.tiktok_item_id ?? null),
          views: paidOnly(a.video_views),
          likes: paidOnly(a.likes),
          shares: paidOnly(a.shares),
          comments: paidOnly(a.comments),
        };
      });
  }

  // ── Daily timeline (videos count, likes, follows) ─────────────────────────
  type DayAcc = {
    date: string;
    videos: Set<string>;
    likes: number;
    follows: number;
    spend: number;
    video_views: number;
    views2s: number;
    views6s: number;
    views50pct: number;
    views100pct: number;
    engagement: number;
  };
  const dayMap = new Map<string, DayAcc>();
  for (const r of rows) {
    const day = String(r.stat_time_day ?? "").slice(0, 10);
    if (!day) continue;
    const adId = String(r.ad_id ?? "");
    const e = dayMap.get(day);
    if (e) {
      if (adId) e.videos.add(adId);
      e.likes += num(r.likes);
      e.follows += num(r.follows);
      e.spend += num(r.spend);
      e.video_views += num(r.video_views);
      e.views2s += num(r.video_watched_2s);
      e.views6s += num(r.video_watched_6s);
      e.views50pct += num(r.video_view_p50);
      e.views100pct += num(r.video_view_p100);
      e.engagement += num(r.likes) + num(r.comments) + num(r.shares);
    } else {
      dayMap.set(day, {
        date: day,
        videos: adId ? new Set([adId]) : new Set(),
        likes: num(r.likes),
        follows: num(r.follows),
        spend: num(r.spend),
        video_views: num(r.video_views),
        views2s: num(r.video_watched_2s),
        views6s: num(r.video_watched_6s),
        views50pct: num(r.video_view_p50),
        views100pct: num(r.video_view_p100),
        engagement: num(r.likes) + num(r.comments) + num(r.shares),
      });
    }
  }
  const sortedDays = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const dailyTimeline = sortedDays.map((d) => ({
    date: d.date,
    videos: d.videos.size,
    likes: d.likes,
    follows: d.follows,
  }));

  const videosDaily = sortedDays.map((d) => ({
    date: d.date,
    total: d.video_views,
    views2s: d.views2s,
    views6s: d.views6s,
    views50pct: d.views50pct,
    views100pct: d.views100pct,
  }));

  // Weekly engagement (Mon..Sun)
  const weeklyEngagement = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  const weekKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  for (const d of sortedDays) {
    const dt = new Date(d.date + "T00:00:00Z");
    const k = weekKeys[dt.getUTCDay()];
    weeklyEngagement[k] += d.engagement;
  }

  // ── Timing heatmap: engagement rate by weekday × hour (F14) ────────────────
  // Synced separately/less often (see /api/tiktok/sync-heatmap) — only a
  // rolling recent window exists, so this may not cover the full date range.
  let heatmapQuery = sb
    .from("tiktok_hourly_stats")
    .select("stat_time_hour, impressions, likes, comments, shares, advertiser_id, campaign_id, campaign_name");
  if (advFilter && advFilter.length > 0) heatmapQuery = heatmapQuery.in("advertiser_id", advFilter);
  heatmapQuery = heatmapQuery.gte("stat_time_hour", `${dateFrom}T00:00:00`).lte("stat_time_hour", `${dateTo}T23:59:59`);
  const { data: hourlyRows } = await heatmapQuery;

  // F18: per-cell campaign breakdown — same aggregation as before, plus a
  // by_campaign bucket (keyed on campaign_id so two campaigns that happen to
  // share a name don't get merged) so a cell's hover can say *which*
  // campaign it's coming from instead of just the account-wide rate.
  const heatmapCells = new Map<
    string,
    { impressions: number; engagement: number; byCampaign: Map<string, { name: string; impressions: number; engagement: number }> }
  >();
  for (const r of (hourlyRows ?? []) as Row[]) {
    const ts = new Date(String(r.stat_time_hour ?? ""));
    if (isNaN(ts.getTime())) continue;
    const weekday = weekKeys[ts.getUTCDay()];
    const hour = ts.getUTCHours();
    const key = `${weekday}_${hour}`;
    const impressions = num(r.impressions);
    const engagement = num(r.likes) + num(r.comments) + num(r.shares);
    const e = heatmapCells.get(key) ?? { impressions: 0, engagement: 0, byCampaign: new Map() };
    e.impressions += impressions;
    e.engagement += engagement;
    const campaignId = String(r.campaign_id ?? "");
    if (campaignId) {
      const c = e.byCampaign.get(campaignId) ?? { name: String(r.campaign_name ?? campaignId), impressions: 0, engagement: 0 };
      c.impressions += impressions;
      c.engagement += engagement;
      e.byCampaign.set(campaignId, c);
    }
    heatmapCells.set(key, e);
  }
  const TOP_CAMPAIGNS_PER_CELL = 3;
  const timingHeatmap = weekKeys.flatMap((weekday) =>
    Array.from({ length: 24 }, (_, hour) => {
      const cell = heatmapCells.get(`${weekday}_${hour}`);
      const topCampaigns = cell
        ? [...cell.byCampaign.values()]
            .filter((c) => c.impressions > 0)
            .sort((a, b) => b.engagement - a.engagement)
            .slice(0, TOP_CAMPAIGNS_PER_CELL)
            .map((c) => ({ campaign_name: c.name, engagement_rate: round2((c.engagement / c.impressions) * 100) }))
        : [];
      return {
        weekday,
        hour,
        engagement_rate: cell && cell.impressions > 0 ? round2((cell.engagement / cell.impressions) * 100) : 0,
        top_campaigns: topCampaigns,
      };
    }),
  );

  // ── Cost distribution by objective ────────────────────────────────────────
  // Map TikTok objective_type → user-facing category
  const objectiveCategoryMap: Record<string, "Reach" | "Video View" | "Community Interaction" | "Other"> = {
    REACH: "Reach",
    VIDEO_VIEWS: "Video View",
    VIDEO_VIEW: "Video View",
    ENGAGEMENT: "Community Interaction",
    COMMUNITY_INTERACTION: "Community Interaction",
    LIKES: "Community Interaction",
    FOLLOWERS: "Community Interaction",
    PROFILE_VIEWS: "Community Interaction",
  };
  const costDistribution: Record<string, number> = {
    Reach: 0,
    "Video View": 0,
    "Community Interaction": 0,
    Other: 0,
  };
  // "Other" being 100% isn't necessarily a bug — TikTok objective types like
  // TRAFFIC/LEAD_GENERATION/WEB_CONVERSIONS/APP_PROMOTION genuinely don't
  // fit any of the 3 named buckets above, so they're correctly "Other" by
  // this classification. What WAS a bug is that "Other" gave no way to
  // tell "campaign objective doesn't fit the 3 buckets" apart from "objective
  // never got synced (null)" — this surfaces which raw objective_type
  // values actually ended up there (empty string = never synced) so it's
  // self-diagnosing instead of a silent dead end.
  const otherObjectives = new Set<string>();
  for (const r of rows) {
    const obj = String(r.objective_type ?? "").toUpperCase();
    const cat = objectiveCategoryMap[obj] ?? "Other";
    costDistribution[cat] += num(r.spend);
    if (cat === "Other") otherObjectives.add(obj || "(ยังไม่มีข้อมูล objective)");
  }

  // ── Audience demographics (gender + age) ──────────────────────────────────
  let audienceQuery = sb
    .from("tiktok_audience_demographics")
    .select("dimension_type, dimension_value, spend, impressions, reach, video_views, likes, clicks, video_watched_2s, video_watched_6s, video_views_p50, video_views_p100, stat_time_day, advertiser_id");
  if (advFilter && advFilter.length > 0) audienceQuery = audienceQuery.in("advertiser_id", advFilter);
  if (dateFrom) audienceQuery = audienceQuery.gte("stat_time_day", dateFrom);
  if (dateTo) audienceQuery = audienceQuery.lte("stat_time_day", dateTo);
  const { data: audRows } = await audienceQuery;

  const genderTotals: Record<string, number> = { MALE: 0, FEMALE: 0, UNKNOWN: 0 };
  const ageTotals: Record<string, number> = {};
  type AgePerf = {
    spend: number; impressions: number; clicks: number; video_views: number;
    watched_2s: number; watched_6s: number; views_p50: number; views_p100: number;
  };
  const emptyAgePerf = (): AgePerf => ({
    spend: 0, impressions: 0, clicks: 0, video_views: 0,
    watched_2s: 0, watched_6s: 0, views_p50: 0, views_p100: 0,
  });
  const agePerf: Record<string, AgePerf> = {};
  const occupationTotals: Record<string, number> = {}; // F12: Top Occupation
  for (const r of (audRows ?? []) as Row[]) {
    const dim = String(r.dimension_type ?? "");
    const val = String(r.dimension_value ?? "").toUpperCase();
    const reach = num(r.reach);
    if (dim === "gender") {
      const key = val.includes("MALE") && !val.includes("FEMALE")
        ? "MALE"
        : val.includes("FEMALE")
          ? "FEMALE"
          : "UNKNOWN";
      genderTotals[key] += reach;
    } else if (dim === "age") {
      ageTotals[val] = (ageTotals[val] ?? 0) + reach;
      const p = agePerf[val] ?? emptyAgePerf();
      p.spend += num(r.spend);
      p.impressions += num(r.impressions);
      p.clicks += num(r.clicks);
      p.video_views += num(r.video_views);
      p.watched_2s += num(r.video_watched_2s);
      p.watched_6s += num(r.video_watched_6s);
      p.views_p50 += num(r.video_views_p50);
      p.views_p100 += num(r.video_views_p100);
      agePerf[val] = p;
    } else if (dim === "occupation") {
      if (val) occupationTotals[val] = (occupationTotals[val] ?? 0) + reach;
    }
  }
  const totalOccupation = Object.values(occupationTotals).reduce((a, b) => a + b, 0);
  // F12: Top Occupation — same shape/rounding as Interest Alignment below,
  // capped to the top 10 since TikTok's occupation values aren't a small
  // fixed enum like age/gender.
  const audienceOccupations = Object.entries(occupationTotals)
    .map(([occupation, reach]) => ({
      occupation,
      percentage: totalOccupation > 0 ? round2((reach / totalOccupation) * 100) : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 10);
  const totalGender = genderTotals.MALE + genderTotals.FEMALE;
  const audienceGender = {
    male: totalGender > 0 ? round2((genderTotals.MALE / totalGender) * 100) : 0,
    female: totalGender > 0 ? round2((genderTotals.FEMALE / totalGender) * 100) : 0,
  };

  const ageOrder = ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"];
  const ageLabel: Record<string, string> = {
    AGE_18_24: "18-24",
    AGE_25_34: "25-34",
    AGE_35_44: "35-44",
    AGE_45_54: "45-54",
    AGE_55_100: "55+",
  };
  const totalAge = Object.values(ageTotals).reduce((a, b) => a + b, 0);
  const audienceAge = ageOrder.map((k) => ({
    group: ageLabel[k],
    percentage: totalAge > 0 ? round2(((ageTotals[k] ?? 0) / totalAge) * 100) : 0,
  }));

  // Age breakdown w/ performance (Cost, CPC, CTR, Video Views) — doc's "Detailed analysis by Age" table
  const audienceAgePerformance = ageOrder.map((k) => {
    const p = agePerf[k] ?? emptyAgePerf();
    // Watch-depth rates share ONE denominator — that age group's total video
    // views — so 2s/6s/50%/100% read as a funnel that only ever narrows.
    // Dividing each stage by the previous one instead would give
    // step-to-step retention: a different (also useful) number, but then the
    // columns can't be compared against each other or against the ad-level
    // view rates in lib/tiktok-metrics.ts, which use this same convention.
    const rate = (n: number) => (p.video_views > 0 ? round2((n / p.video_views) * 100) : 0);
    return {
      group: ageLabel[k],
      spend: round2(p.spend),
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: p.impressions > 0 ? round2((p.clicks / p.impressions) * 100) : 0,
      cpc: p.clicks > 0 ? round2(p.spend / p.clicks) : 0,
      video_views: p.video_views,
      watched_2s: p.watched_2s,
      watched_6s: p.watched_6s,
      views_p50: p.views_p50,
      views_p100: p.views_p100,
      rate_2s: rate(p.watched_2s),
      rate_6s: rate(p.watched_6s),
      rate_p50: rate(p.views_p50),
      rate_p100: rate(p.views_p100),
    };
  });

  // ── Audience by province (TH) ─────────────────────────────────────────────
  let locQuery = sb
    .from("tiktok_audience_locations")
    .select("province_id, province_name, reach, impressions, video_views, advertiser_id, stat_time_day");
  if (advFilter && advFilter.length > 0) locQuery = locQuery.in("advertiser_id", advFilter);
  if (dateFrom) locQuery = locQuery.gte("stat_time_day", dateFrom);
  if (dateTo) locQuery = locQuery.lte("stat_time_day", dateTo);
  const { data: locRows } = await locQuery;

  const provinceMap = new Map<string, { id: string; name: string; reach: number }>();
  for (const r of (locRows ?? []) as Row[]) {
    const id = String(r.province_id ?? "");
    if (!id) continue;
    const name = String(r.province_name ?? "");
    const reach = num(r.reach);
    const e = provinceMap.get(id);
    if (e) {
      e.reach += reach;
      if (!e.name && name) e.name = name;
    } else {
      provinceMap.set(id, { id, name, reach });
    }
  }
  const totalProvince = [...provinceMap.values()].reduce((a, p) => a + p.reach, 0);
  const audienceProvinces = [...provinceMap.values()]
    .map((p) => ({
      province_id: p.id,
      // province_id "0" is TikTok's own bucket for audience it couldn't
      // place in a specific province (not a real location) — label it
      // instead of showing "0" like it's a place. Every real province_id
      // is a multi-digit TikTok location id, never a bare "0".
      province_name: p.id === "0" ? "ไม่ระบุจังหวัด" : p.name || p.id,
      percentage: totalProvince > 0 ? round2((p.reach / totalProvince) * 100) : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // ── Interest Alignment (F12/doc) ────────────────────────────────────────
  // The interest_category dimension itself is CONFIRMED live — real
  // category ids come back — but `reach` consistently reads 0 for this
  // particular dimension cut (TikTok most likely can't dedupe reach here),
  // so basing the % on reach alone made every row show 0.0%. impressions
  // is fetched too and is a plain additive count TikTok always supports —
  // used as the basis whenever reach totals to 0.
  // ── Audience interests, fetched live for the selected range ──────────────
  // tiktok_audience_interests cannot be summed. TikTok refuses a time
  // breakdown on the interest_category dimension, so each stored row is a
  // whole 30-day chunk's aggregate stamped with that chunk's end date. Sync
  // runs daily from a rolling start, so chunk boundaries move and the table
  // accumulates overlapping aggregates of the same days. Adding them up gave
  // one category 9.7M impressions against an account that served ~250k in
  // the period — roughly 39x — which is why every category pinned at the
  // 100% cap.
  //
  // Same answer as reach: a figure TikTok will only aggregate itself has to
  // be asked for over the exact range wanted, in one call per advertiser.
  const interestReach: Record<string, number> = {};
  const interestImpressions: Record<string, number> = {};
  let interestSource: "api_range" | "stored_latest_chunk" = "api_range";

  try {
    const perAdvertiser = await Promise.all(
      advertiserIdsOf(rows).map((id) => fetchAudienceInterests(id, dateFrom, dateTo)),
    );
    for (const row of perAdvertiser.flat()) {
      const cat = row.interest_category;
      if (!cat) continue;
      interestReach[cat] = (interestReach[cat] ?? 0) + row.reach;
      interestImpressions[cat] = (interestImpressions[cat] ?? 0) + row.impressions;
    }
  } catch (err) {
    // Fall back to ONE stored chunk rather than the sum of all of them: a
    // single chunk is a real aggregate of a real period, where the sum is
    // not an aggregate of anything.
    interestSource = "stored_latest_chunk";
    console.error("[tiktok/dashboard] live interest fetch failed, falling back to newest stored chunk:", formatTikTokError(err));

    let interestQuery = sb
      .from("tiktok_audience_interests")
      .select("interest_category, reach, impressions, advertiser_id, stat_time_day")
      .order("stat_time_day", { ascending: false });
    if (advFilter && advFilter.length > 0) interestQuery = interestQuery.in("advertiser_id", advFilter);
    const { data: interestRows } = await interestQuery;

    const newestByAdvertiser = new Map<string, string>();
    for (const r of (interestRows ?? []) as Row[]) {
      const adv = String(r.advertiser_id ?? "");
      const day = String(r.stat_time_day ?? "");
      if (adv && day && !newestByAdvertiser.has(adv)) newestByAdvertiser.set(adv, day);
    }
    for (const r of (interestRows ?? []) as Row[]) {
      const adv = String(r.advertiser_id ?? "");
      const cat = String(r.interest_category ?? "");
      if (!cat || newestByAdvertiser.get(adv) !== String(r.stat_time_day ?? "")) continue;
      interestReach[cat] = (interestReach[cat] ?? 0) + num(r.reach);
      interestImpressions[cat] = (interestImpressions[cat] ?? 0) + num(r.impressions);
    }
  }

  const totalInterestReach = Object.values(interestReach).reduce((a, b) => a + b, 0);
  const totalInterestImpressions = Object.values(interestImpressions).reduce((a, b) => a + b, 0);
  const useImpressionsForInterest = totalInterestReach === 0 && totalInterestImpressions > 0;

  // Interest categories OVERLAP: one impression is counted under every
  // interest its viewer has, so the fifteen categories here sum to roughly
  // fifteen times the account's actual impressions. Dividing each category
  // by that sum — which this did — makes every category land on ~1/15, and
  // the chart showed 6.8%, 6.8%, 6.8% … down to 6.0%, which says nothing
  // about the audience at all.
  //
  // The figure that means something is penetration: what share of the
  // account's impressions came from people with that interest. Those
  // deliberately sum well past 100%, which is how TikTok's own Audience
  // Insights presents them (News & Entertainment 92.9%, Beauty 87.9%, …).
  const interestDenominator = useImpressionsForInterest ? totals.impressions : totals.reach;

  // interest_category id → name — best-effort lookup, see
  // fetchInterestCategoryNames in lib/tiktok-ads.ts. Unresolved ids just
  // keep showing as their raw numeric code, same as before this existed.
  const { data: interestNameRows, error: interestNameErr } = await sb.from("tiktok_interest_category_names").select("category_id, category_name");
  if (interestNameErr) console.error("[tiktok/dashboard] tiktok_interest_category_names lookup failed:", interestNameErr.message);
  const interestNameMap = new Map((interestNameRows ?? []).map((r) => [r.category_id, r.category_name]));

  const audienceInterests = Object.keys(interestReach)
    .map((category) => {
      const value = useImpressionsForInterest ? interestImpressions[category] : interestReach[category];
      return {
        category: interestNameMap.get(category) ?? category,
        // Deliberately NOT capped at 100. A cap here is what hid the last
        // bug: every category was overshooting the denominator by ~39x and
        // all fifteen rendered as a tidy 100.0%. Penetration above 100% is
        // a contradiction, so seeing one is the signal that the two sides
        // no longer describe the same thing.
        percentage: interestDenominator > 0 ? round2((value / interestDenominator) * 100) : 0,
      };
    })
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 15);

  // TikTok assigns interests generously — a viewer carries almost all of
  // them — so these percentages land between roughly 82% and 98% and, drawn
  // as bars on a 0-100 axis, are fifteen indistinguishable full-width bars.
  // What separates the categories is the distance from the middle, so each
  // row carries it: how many percentage points above or below the average
  // this category sits.
  const interestAverage =
    audienceInterests.length > 0
      ? audienceInterests.reduce((sum, i) => sum + i.percentage, 0) / audienceInterests.length
      : 0;
  const audienceInterestsIndexed = audienceInterests.map((i) => ({
    ...i,
    vs_average: round2(i.percentage - interestAverage),
  }));

  // ── Profile metrics snapshot (F15 — see /api/tiktok/sync-profile's file
  //    comment: unverified against a live account, best-effort only) ────────
  let snapQuery = sb
    .from("tiktok_business_snapshot")
    .select("advertiser_id, snapshot_date, followers_count, likes_count")
    .order("snapshot_date", { ascending: false })
    .limit(200); // a handful of recent days across all advertisers is plenty
  if (advFilter && advFilter.length > 0) snapQuery = snapQuery.in("advertiser_id", advFilter);
  const { data: snapRows } = await snapQuery;

  const byDate = new Map<string, number>(); // date -> total followers across advertisers
  const likesByDate = new Map<string, number>();
  for (const r of (snapRows ?? []) as Row[]) {
    const date = String(r.snapshot_date ?? "");
    byDate.set(date, (byDate.get(date) ?? 0) + num(r.followers_count));
    likesByDate.set(date, (likesByDate.get(date) ?? 0) + num(r.likes_count));
  }
  const sortedSnapDates = [...byDate.keys()].sort().reverse();
  const latestDate = sortedSnapDates[0];
  const prevDate = sortedSnapDates[1];
  const latestFollowers = latestDate ? byDate.get(latestDate)! : 0;
  const newFollowers = latestDate && prevDate ? latestFollowers - byDate.get(prevDate)! : null;
  // ── Account-level metrics ────────────────────────────────────────────────
  // From tiktok_account_totals_daily, filled by /api/tiktok/sync-windsor or
  // /api/tiktok/sync-account-totals — the table is the interface, so this
  // read neither knows nor cares which one wrote the rows.
  //
  // Best-effort on every axis: the table may not exist yet, so any failure
  // leaves these null and the UI shows "—" rather than a zero that reads as
  // real data. Read for the previous period too, so these tiles carry the
  // same period-over-period comparison every other KPI on the page has.
  const readAccountTotals = async (from: string, to: string) => {
    const { data, error } = await sb
      .from("tiktok_account_totals_daily")
      .select("stat_time_day, profile_views, new_followers, followers_count, video_views")
      .gte("stat_time_day", from)
      .lte("stat_time_day", to)
      .order("stat_time_day", { ascending: false });
    if (error) {
      console.error("[tiktok/dashboard] tiktok_account_totals_daily read failed (non-fatal):", error.message);
      return null;
    }
    if (!data || data.length === 0) return null;
    return {
      profile_views: data.reduce((sum, r) => sum + num(r.profile_views), 0),
      // video_views is a daily figure like profile_views (not a running
      // total), so summing a range gives the account's real total for it —
      // confirmed against TikTok Studio's own export, see sync-windsor.
      video_views: data.reduce((sum, r) => sum + num(r.video_views), 0),
      // new_followers is a signed daily delta, so summing a range gives the
      // net change over it — that is the intended reading.
      new_followers: data.reduce((sum, r) => sum + num(r.new_followers), 0),
      // followers_count is a running total, never summed: the most recent
      // day in range IS the figure.
      followers: num(data[0].followers_count),
    };
  };

  const accountNow = await readAccountTotals(dateFrom, dateTo);
  const accountPrev = await readAccountTotals(prevFrom, prevTo);

  const profileMetrics = {
    // Account totals first, the older F15 snapshot as the fallback.
    followers: accountNow?.followers ?? (latestDate ? latestFollowers : null),
    new_followers: accountNow?.new_followers ?? newFollowers,
    // Only the account-level source has this — there is no profile-views
    // metric anywhere in the Marketing API to fall back to.
    profile_views: accountNow?.profile_views ?? null,
    // Account-wide video views (paid + organic), independent of
    // totals.video_views which is paid-only from tiktok_ads_rawdata.
    video_views: accountNow?.video_views ?? null,
    engagement_rate: latestDate && latestFollowers > 0 ? round2(((likesByDate.get(latestDate) ?? 0) / latestFollowers) * 100) : null,
    snapshot_date: latestDate ?? null,
    // Same window length immediately before dateFrom (prevFrom/prevTo).
    // null when there is nothing to compare against, so the UI leaves the
    // comparison off rather than reporting a change measured from an
    // assumed zero.
    prev_profile_views: accountPrev?.profile_views ?? null,
    prev_followers: accountPrev?.followers ?? null,
    prev_new_followers: accountPrev?.new_followers ?? null,
    prev_video_views: accountPrev?.video_views ?? null,
  };

  // ── Restricted metrics (EC4) — which report metrics TikTok is rejecting
  //    with permission_denied for the advertiser(s) in scope, so the UI can
  //    say *why* a KPI reads 0 instead of leaving it unexplained ─────────
  let permQuery = sb.from("tiktok_metric_permissions").select("metric, advertiser_id");
  if (advFilter && advFilter.length > 0) permQuery = permQuery.in("advertiser_id", advFilter);
  const { data: permRows } = await permQuery;
  const restrictedMetrics = [...new Set((permRows ?? []).map((r) => String(r.metric)))].sort();

  // ── Advertiser list (dropdown options) — Viewer only sees advertisers
  //    they've been granted, same restriction as the data above. ───────────
  let advListQuery = sb.from("tiktok_advertisers").select("advertiser_id, advertiser_name").order("advertiser_name");
  if (allowedAdvertiserIds) advListQuery = advListQuery.in("advertiser_id", allowedAdvertiserIds);
  const { data: advRows } = await advListQuery;

  // F26: last successful sync timestamp, so the UI can label stale/cached data.
  const { data: lastSuccessLog } = await sb
    .from("tiktok_sync_log")
    .select("finished_at")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    totals,
    prev_totals: prevTotals,
    prev_video_count: prevVideoCount,
    mom_change: momChange,
    last_success_at: lastSuccessLog?.finished_at ?? null,
    quadrant_thresholds: {
      spend_threshold: round2(spendThreshold),
      rate_threshold: rateThreshold,
      is_custom: quadrantSettingsRow?.spend_threshold != null || quadrantSettingsRow?.rate_threshold != null,
    },
    by_ad: byAdWithCover,
    best_videos: bestVideos,
    video_engagement_summary: videoEngagementSummary,
    advertisers: advRows ?? [],
    daily_timeline: dailyTimeline,
    videos_daily: videosDaily,
    weekly_engagement: weeklyEngagement,
    timing_heatmap: timingHeatmap,
    profile_metrics: profileMetrics,
    cost_distribution: costDistribution,
    cost_distribution_other_objectives: [...otherObjectives].sort(),
    audience_gender: audienceGender,
    audience_age: audienceAge,
    audience_age_performance: audienceAgePerformance,
    audience_provinces: audienceProvinces,
    audience_interests: audienceInterestsIndexed,
    interest_average: round2(interestAverage),
    audience_occupations: audienceOccupations,
    restricted_metrics: restrictedMetrics,
    // "api_deduped" = TikTok deduplicated reach for this exact range.
    // "summed_fallback" = the live call failed and reach is the old summed
    // figure, which overcounts; worth surfacing rather than silently showing
    // a number that means something different.
    reach_source: reachSource,
    // "api_range" = asked of TikTok for exactly this range. 
    // "stored_latest_chunk" = live call failed, showing one stored 30-day
    // chunk instead, which is not the selected period.
    interest_source: interestSource,
  });
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function computeTotals(rows: Row[]) {
  const t = {
    spend: 0,
    impressions: 0,
    reach: 0,
    video_views: 0,
    video_watched_2s: 0,
    video_watched_6s: 0,
    video_view_p50: 0,
    video_view_p100: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    follows: 0,
    clicks: 0,
  };
  let watchTimeWeighted = 0;
  for (const r of rows) {
    t.spend += num(r.spend);
    t.impressions += num(r.impressions);
    t.reach += num(r.reach);
    t.video_views += num(r.video_views);
    t.video_watched_2s += num(r.video_watched_2s);
    t.video_watched_6s += num(r.video_watched_6s);
    t.video_view_p50 += num(r.video_view_p50);
    t.video_view_p100 += num(r.video_view_p100);
    t.likes += num(r.likes);
    t.comments += num(r.comments);
    t.shares += num(r.shares);
    t.follows += num(r.follows);
    t.clicks += num(r.clicks);
    watchTimeWeighted += num(r.average_video_play) * num(r.video_views);
  }
  return {
    ...t,
    cpm: t.impressions > 0 ? round2((t.spend / t.impressions) * 1000) : 0,
    cpc: t.clicks > 0 ? round2(t.spend / t.clicks) : 0,
    avg_watch_time: t.video_views > 0 ? round2(watchTimeWeighted / t.video_views) : 0,
    view_50_rate: t.video_views > 0 ? round2((t.video_view_p50 / t.video_views) * 100) : 0,
  };
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000);
}
function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
