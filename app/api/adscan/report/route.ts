import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { loadReport } from "@/lib/adscanReport";

export const dynamic = "force-dynamic";

/** GET /api/adscan/report?days=30 — admin + HR (proxy.ts). Every view is access-logged (TOR). */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const days = [7, 30, 90].includes(Number(req.nextUrl.searchParams.get("days"))) ? Number(req.nextUrl.searchParams.get("days")) : 30;
  const sb = getSupabase();
  const { data: me } = await sb.from("ads_users").select("username").eq("id", userId).maybeSingle();
  await sb.from("ads_user_access_logs").insert({
    user_id: userId, username: me?.username ?? "?", page: "adscan_performance_report",
    ip_address: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null, user_agent: req.headers.get("user-agent"),
  });
  try {
    return NextResponse.json(await loadReport(days));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
