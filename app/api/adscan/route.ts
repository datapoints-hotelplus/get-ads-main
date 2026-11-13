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
    return NextResponse.json({ ...(await loadAdscan(me.userId, me.role)), readOnly: me.role === "hr" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/adscan { campaign_id, type: "fixed"|"skipped", label } — record what was done. */
export async function POST(req: NextRequest) {
  const me = who(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role === "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 }); // HR is view-only
  const body = await req.json().catch(() => null);
  const { campaign_id, type, labels, note: rawNote } = (body ?? {}) as Record<string, unknown>;
  const choices = type === "fixed" ? DONE_CHOICES : type === "skipped" ? SKIP_CHOICES : null;
  // One or more choices; kept in the order of the choice list so the same pick always reads the same.
  const picked = choices && Array.isArray(labels) ? choices.filter((c) => labels.includes(c)) : [];
  if (typeof campaign_id !== "string" || !campaign_id || !choices || !Array.isArray(labels) || !picked.length || picked.length !== new Set(labels).size) {
    return NextResponse.json({ error: "campaign_id, type และ labels ไม่ถูกต้อง" }, { status: 400 });
  }
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length > 300) return NextResponse.json({ error: "รายละเอียดยาวเกิน 300 ตัวอักษร" }, { status: 400 });
  if (picked.includes("อื่น ๆ") && !note) return NextResponse.json({ error: "เลือก “อื่น ๆ” ต้องกรอกรายละเอียด" }, { status: 400 });
  // Free text lives in label (no extra column), e.g. "ลด Budget, อื่น ๆ: ปิดโฆษณาซ้ำ".
  const label = picked.map((c) => (c === "อื่น ๆ" ? `อื่น ๆ: ${note}` : c)).join(", ");
  try {
    // Recompute for this user: only an open issue on their own account can be recorded.
    const data = await loadAdscan(me.userId, me.role);
    const alert = data.alerts.find((a) => a.id === campaign_id);
    // Only red (critical) needs a fixed/skipped answer; yellow is shown for awareness only.
    if (!alert || alert.sev !== "critical") return NextResponse.json({ error: "ไม่พบเรื่องนี้" }, { status: 404 });
    if (alert.status !== "open") return NextResponse.json({ error: "เรื่องนี้บันทึกไปแล้ว" }, { status: 409 });
    const { error } = await getSupabase().from("adscan_actions").insert({
      campaign_id, account_id: alert.hotelId, user_id: me.userId, type,
      label,
      metric: alert.templateMetric, value_at: alert.value,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
