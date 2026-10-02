/**
 * app/api/tiktok/sync-interest-names/route.ts
 * POST /api/tiktok/sync-interest-names
 *
 * Debug/utility endpoint — refetches just the interest_category id→name
 * lookup (tiktok_interest_category_names) without running the full ads
 * sync. Same fetch the main /api/tiktok/sync route runs as one step of
 * many; split out here so it can be re-triggered fast while confirming the
 * TikTok response shape (see fetchInterestCategoryNames in lib/tiktok-ads.ts).
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAuthorizedSyncCaller } from "@/lib/syncAuth";
import { fetchInterestCategoryNames, debugFindPreviewEndpoint } from "@/lib/tiktok-ads";

export async function POST(req: Request) {
  if (!(await isAuthorizedSyncCaller(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();

  // TEMP: probe candidate ad-preview endpoints for one real ad — see
  // debugFindPreviewEndpoint comment, delete alongside it once resolved.
  const { data: sampleAd } = await sb.from("tiktok_ads_rawdata").select("ad_id, advertiser_id").limit(1).maybeSingle();
  if (sampleAd) await debugFindPreviewEndpoint(sampleAd.advertiser_id, sampleAd.ad_id);

  const { data: advertisers } = await sb
    .from("tiktok_advertisers")
    .select("advertiser_id")
    .eq("is_active", true);

  const results = await Promise.all(
    (advertisers ?? []).map((a) => fetchInterestCategoryNames(a.advertiser_id)),
  );
  const names = new Map<string, string>();
  for (const m of results) for (const [id, name] of m) names.set(id, name);

  if (names.size > 0) {
    await sb.from("tiktok_interest_category_names").upsert(
      [...names.entries()].map(([category_id, category_name]) => ({ category_id, category_name })),
      { onConflict: "category_id" },
    );
  }

  return NextResponse.json({ success: true, advertisers_checked: advertisers?.length ?? 0, names_found: names.size });
}
