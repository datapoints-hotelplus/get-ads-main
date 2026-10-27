import { NextRequest, NextResponse } from "next/server";
import { toRole } from "@/lib/access";
import { loadAdscan } from "@/lib/adscanData";
import { recommendationFor } from "@/lib/adscanAi";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // one AI call; slow models can take a while

/**
 * GET /api/adscan/ai?id=<campaign_id> — the AI recommendation for one of the
 * caller's own alerts. Generated the first time anyone opens it for the
 * current data date (and skill version); stored and reused after that.
 */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  try {
    // Same scoping as the page: only an alert on the caller's own hotels.
    const data = await loadAdscan(userId, toRole(req.headers.get("x-user-role")));
    const alert = id ? data.alerts.find((a) => a.id === id) : undefined;
    if (!alert || !data.latestDate) return NextResponse.json({ error: "ไม่พบเรื่องนี้" }, { status: 404 });
    return NextResponse.json(await recommendationFor(alert, data.latestDate));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
