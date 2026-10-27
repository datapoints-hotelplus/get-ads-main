import { NextResponse } from "next/server";
import { isAuthorizedSyncCaller } from "@/lib/syncAuth";
import { scanPending } from "@/lib/adscanScan";

export const dynamic = "force-dynamic";

/**
 * POST /api/adscan/scan — apply any unscanned data dates to the persistent
 * alerts now. Call it from n8n right after the sync finishes (Bearer
 * SYNC_TRIGGER_SECRET) or as an admin. Opening ADSCAN does the same lazily.
 */
export async function POST(req: Request) {
  if (!(await isAuthorizedSyncCaller(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, daysScanned: await scanPending() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
