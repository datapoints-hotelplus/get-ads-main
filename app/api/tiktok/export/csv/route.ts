/**
 * app/api/tiktok/export/csv/route.ts
 * GET /api/tiktok/export/csv?date_from&date_to&advertiser_id
 *
 * F23: server-side CSV export — same filters, same per-ad numbers (incl. F17
 * quadrant) as the dashboard, via the shared lib/tiktok-metrics.ts. Was
 * previously generated client-side in the browser; TOR asks for server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { computeAdMetrics } from "@/lib/tiktok-metrics";
import { applyDedupedReachToAds } from "@/lib/tiktok-ads";

function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const { searchParams } = req.nextUrl;

  const dateTo = searchParams.get("date_to") ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dateFrom = searchParams.get("date_from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const advertiserIds = searchParams.get("advertiser_id");
  const advFilter = advertiserIds ? advertiserIds.split(",").map((s) => s.trim()).filter(Boolean) : null;

  let query = sb
    .from("tiktok_ads_rawdata")
    .select(
      "advertiser_id,advertiser_name,campaign_name,adgroup_name,ad_id,ad_name,spend,impressions,reach,clicks,video_views,video_watched_2s,video_watched_6s,video_view_p50,video_view_p100,likes,comments,shares,follows",
    )
    .gte("stat_time_day", dateFrom)
    .lte("stat_time_day", dateTo);
  if (advFilter && advFilter.length > 0) query = query.in("advertiser_id", advFilter);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: quadrantSettingsRow } = await sb
    .from("tiktok_quadrant_settings")
    .select("spend_threshold, rate_threshold")
    .eq("id", 1)
    .maybeSingle();

  const { byAd } = computeAdMetrics(rows ?? [], quadrantSettingsRow);
  // Same fix as the dashboard route: byAd's reach is a per-ad-per-day sum,
  // which overcounts anyone an ad reached on more than one day. Best-effort
  // — a failed live call just leaves the summed figure in the export rather
  // than blocking it, but on success this is what keeps the CSV matching
  // the dashboard exactly, per this file's own reason for existing.
  const advertiserIdsInRows = [...new Set((rows ?? []).map((r) => String(r.advertiser_id ?? "")).filter(Boolean))];
  await applyDedupedReachToAds(byAd, advertiserIdsInRows, dateFrom, dateTo);

  const header = [
    "advertiser_name", "campaign_name", "adgroup_name", "ad_name",
    "spend", "impressions", "reach", "clicks", "ctr", "cpc", "video_views",
    "view_2s_rate", "view_6s_rate", "view_50_rate", "view_100_rate",
    "likes", "comments", "shares", "follows", "quadrant",
  ];
  const lines = [
    header.join(","),
    ...byAd
      .sort((a, b) => b.spend - a.spend)
      .map((r) =>
        [
          r.advertiser_name, r.campaign_name, r.adgroup_name, r.ad_name,
          r.spend, r.impressions, r.reach, r.clicks, r.ctr, r.cpc, r.video_views,
          r.view_2s_rate, r.view_6s_rate, r.view_50_rate, r.view_100_rate,
          r.likes, r.comments, r.shares, r.follows, r.quadrant,
        ].map(csvEscape).join(","),
      ),
  ];
  // Leading BOM so Excel opens Thai/UTF-8 text correctly instead of mangling it.
  const csv = "﻿" + lines.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tiktok-ads-report_${dateFrom}_to_${dateTo}.csv"`,
    },
  });
}
