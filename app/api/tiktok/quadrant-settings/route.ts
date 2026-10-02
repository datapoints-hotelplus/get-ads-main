/**
 * app/api/tiktok/quadrant-settings/route.ts
 * F17: admin-configurable Quadrant Matrix thresholds (spend axis, rate axis).
 * GET returns the current override (nulls = "use auto-computed default").
 * PUT sets it; pass null for either field to clear back to auto.
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAuthorizedSyncCaller } from "@/lib/syncAuth";

export async function GET() {
  const sb = getSupabase();
  const { data } = await sb
    .from("tiktok_quadrant_settings")
    .select("spend_threshold, rate_threshold")
    .eq("id", 1)
    .maybeSingle();
  return NextResponse.json({
    spend_threshold: data?.spend_threshold ?? null,
    rate_threshold: data?.rate_threshold ?? null,
  });
}

export async function PUT(req: Request) {
  if (!(await isAuthorizedSyncCaller(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { spend_threshold, rate_threshold } = body as {
    spend_threshold?: number | null;
    rate_threshold?: number | null;
  };

  // EC11: 0/negative/NaN would put every ad on one side of the quadrant —
  // block the save instead of quietly accepting a broken threshold. `null`
  // stays valid (clears back to the auto-computed default).
  const invalid = (v: number | null | undefined) => v != null && (!Number.isFinite(v) || v <= 0);
  if (invalid(spend_threshold) || invalid(rate_threshold)) {
    return NextResponse.json(
      { error: "Threshold ไม่ถูกต้อง — ต้องมากกว่า 0 (เว้นว่าง/ไม่ส่งค่า เพื่อใช้ค่า default อัตโนมัติ)" },
      { status: 400 },
    );
  }

  const sb = getSupabase();
  const { error } = await sb.from("tiktok_quadrant_settings").upsert(
    {
      id: 1,
      spend_threshold: spend_threshold ?? null,
      rate_threshold: rate_threshold ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
