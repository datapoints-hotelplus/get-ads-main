import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { toRole } from "@/lib/access";
import { DONE_CHOICES, SKIP_CHOICES } from "@/lib/adscan";
import { loadAdscan } from "@/lib/adscanData";

export const dynamic = "force-dynamic";

// proxy.ts lets only admin/specialist through and injects these headers.
function who(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  return userId ? { userId, role: toRole(req.headers.get("x-user-role")) } : null;
}

/** GET /api/adscan — alerts, hotels and recorded actions for the caller's own accounts. */
export async function GET(req: NextRequest) {
  const me = who(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await loadAdscan(me.userId, me.role));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/adscan { campaign_id, type: "fixed"|"skipped", label } — record what was done. */
export async function POST(req: NextRequest) {
  const me = who(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { campaign_id, type, label } = (body ?? {}) as Record<string, string>;
  const choices = type === "fixed" ? DONE_CHOICES : type === "skipped" ? SKIP_CHOICES : null;
  if (!campaign_id || !choices || !choices.includes(label)) {
    return NextResponse.json({ error: "campaign_id, type และ label ไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    // Recompute for this user: only an open issue on their own account can be recorded.
    const data = await loadAdscan(me.userId, me.role);
    const alert = data.alerts.find((a) => a.id === campaign_id);
    if (!alert || alert.kind !== "issue") return NextResponse.json({ error: "ไม่พบเรื่องนี้" }, { status: 404 });
    if (alert.status !== "open") return NextResponse.json({ error: "เรื่องนี้บันทึกไปแล้ว" }, { status: 409 });
    const { error } = await getSupabase().from("adscan_actions").insert({
      campaign_id, account_id: alert.hotelId, user_id: me.userId, type, label,
      metric: alert.templateMetric, value_at: alert.value,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
