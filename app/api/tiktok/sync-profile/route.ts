/**
 * app/api/tiktok/sync-profile/route.ts
 * POST /api/tiktok/sync-profile
 *
 * F15: Profile Metrics (Profile Views, New Followers, Engagement Rate).
 *
 * ⚠ UNVERIFIED — unlike every other TikTok route in this app, this one has
 * not been confirmed against a live TikTok account. It calls TikTok's
 * *Business Account API* (`/business/get/`), a different product from the
 * Marketing/Ads API everything else here uses:
 *   - It needs the advertiser's TikTok account linked as a "Business
 *     Account" asset, and a `business_id` — there's no confirmed way in
 *     this codebase yet to discover that ID automatically.
 *   - It may need an OAuth scope beyond `ads_management`/`reporting_service`
 *     (see lib/tiktok-token.ts) — TikTok's docs call it out separately.
 *   - TikTok's public API does not appear to expose a historical
 *     "profile views" trend at all — this only snapshots follower/likes/
 *     video counts (see 026_tiktok_business_snapshot.sql); "New Followers"
 *     and "Engagement Rate" are derived from day-over-day deltas on top.
 *
 * Set TIKTOK_BUSINESS_ID once you've confirmed it for the connected
 * account; otherwise this route no-ops per advertiser (logged, not thrown).
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAuthorizedSyncCaller } from "@/lib/syncAuth";
import { fetchBusinessProfile } from "@/lib/tiktok-ads";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isAuthorizedSyncCaller(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const businessId = process.env.TIKTOK_BUSINESS_ID;
  if (!businessId) {
    return NextResponse.json(
      { error: "TIKTOK_BUSINESS_ID not set — see this route's file comment before enabling F15" },
      { status: 501 },
    );
  }

  const sb = getSupabase();
  const { data: advertisers } = await sb
    .from("tiktok_advertisers")
    .select("advertiser_id")
    .eq("is_active", true);

  const today = new Date().toISOString().slice(0, 10);
  const results: { advertiser_id: string; ok: boolean; error?: string }[] = [];

  for (const adv of advertisers ?? []) {
    try {
      const profile = await fetchBusinessProfile(businessId);
      await sb.from("tiktok_business_snapshot").upsert(
        {
          advertiser_id: adv.advertiser_id,
          business_id: businessId,
          snapshot_date: today,
          followers_count: profile.followers_count,
          likes_count: profile.likes_count,
          videos_count: profile.videos_count,
        },
        { onConflict: "advertiser_id,snapshot_date" },
      );
      results.push({ advertiser_id: adv.advertiser_id, ok: true });
    } catch (err) {
      results.push({ advertiser_id: adv.advertiser_id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ success: true, results });
}
