/**
 * app/api/tiktok/sync-heatmap/route.ts
 * POST /api/tiktok/sync-heatmap
 *
 * F14: Timing Heatmap sync — separate cadence from the main daily ads sync
 * (TOR calls for every 12h). Only pulls a rolling recent window since
 * hour-level reports are far more expensive per API call than daily ones.
 * Same dual trigger as /api/tiktok/sync (admin session or n8n/cron secret).
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { daysAgoIn } from "@/lib/adDate";
import { fetchHourlyEngagement, formatTikTokError } from "@/lib/tiktok-ads";

export const maxDuration = 300; // hourly-granularity pulls across many advertisers — see /api/tiktok/sync

const ROLLING_WINDOW_DAYS = 30;
const INTER_ADVERTISER_DELAY_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const sb = getSupabase();
  const { data: advertisers } = await sb
    .from("tiktok_advertisers")
    .select("advertiser_id, advertiser_name")
    .eq("is_active", true);

  if (!advertisers || advertisers.length === 0) {
    return NextResponse.json({ error: "No active advertisers to sync" }, { status: 404 });
  }

  // Account-timezone dates — see lib/adDate.
  const endStr = daysAgoIn(1);
  const startStr = daysAgoIn(ROLLING_WINDOW_DAYS);

  const results: { advertiser_id: string; advertiser_name: string; rows: number; error?: string }[] = [];
  let totalRows = 0;

  for (const adv of advertisers) {
    try {
      const rows = await fetchHourlyEngagement(adv.advertiser_id, startStr, endStr);
      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((r) => ({
          advertiser_id: r.advertiser_id,
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          stat_time_hour: r.stat_time_hour,
          spend: r.spend,
          impressions: r.impressions,
          video_views: r.video_views,
          likes: r.likes,
          comments: r.comments,
          shares: r.shares,
          updated_at: new Date().toISOString(),
        }));
        const { error: upsertErr } = await sb
          .from("tiktok_hourly_stats")
          .upsert(batch, { onConflict: "advertiser_id,campaign_id,stat_time_hour" });
        if (!upsertErr) totalRows += batch.length;
      }
      results.push({ advertiser_id: adv.advertiser_id, advertiser_name: adv.advertiser_name, rows: rows.length });
    } catch (err) {
      results.push({ advertiser_id: adv.advertiser_id, advertiser_name: adv.advertiser_name, rows: 0, error: formatTikTokError(err) });
    }
    await sleep(INTER_ADVERTISER_DELAY_MS);
  }

  return NextResponse.json({ success: true, since: startStr, until: endStr, total_rows: totalRows, advertisers: results });
}
