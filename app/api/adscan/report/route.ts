import { NextRequest, NextResponse } from "next/server";
import { logAccess } from "@/lib/accessLog";
import { loadReport } from "@/lib/adscanReport";

export const dynamic = "force-dynamic";

/** GET /api/adscan/report?days=30 — admin + HR (proxy.ts). Every view is access-logged (TOR). */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const days = [7, 30, 90].includes(Number(req.nextUrl.searchParams.get("days"))) ? Number(req.nextUrl.searchParams.get("days")) : 30;
  await logAccess(req, "adscan_performance_report");
  try {
    return NextResponse.json(await loadReport(days));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
