import { NextRequest, NextResponse } from "next/server";
import { toRole } from "@/lib/access";
import { loadAdscan } from "@/lib/adscanData";
import { stored } from "@/lib/adscanAi";

export const dynamic = "force-dynamic";

/** GET /api/adscan/ai?id=<campaign_id> — the recommendation the 09:00 job stored for one of the caller's own alerts. */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  try {
    // Same scoping as the page: only an alert on the caller's own hotels.
    const data = await loadAdscan(userId, toRole(req.headers.get("x-user-role")));
    if (!id || !data.alerts.some((a) => a.id === id)) return NextResponse.json({ error: "ไม่พบเรื่องนี้" }, { status: 404 });
    const r = await stored(id);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "ยังไม่มีคำแนะนำ — AI จะวิเคราะห์ให้ในรอบ 09:00" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
