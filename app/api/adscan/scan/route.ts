import { NextResponse } from "next/server";
import { isAuthorizedSyncCaller, isSyncBearer } from "@/lib/syncAuth";
import { scanPending, sendDailySummary } from "@/lib/adscanScan";

export const dynamic = "force-dynamic";

/**
 * POST /api/adscan/scan — apply any unscanned data dates to the persistent
 * alerts now. Call it from n8n right after the sync finishes (Bearer
 * SYNC_TRIGGER_SECRET) or as an admin. Opening ADSCAN does the same lazily.
 * Only the Bearer call (n8n) sends the daily Slack message; a failed post is
 * reported in `slack` and doesn't fail the scan, which is already saved.
 */
export async function POST(req: Request) {
  if (!(await isAuthorizedSyncCaller(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const daysScanned = await scanPending();
    if (!isSyncBearer(req)) return NextResponse.json({ ok: true, daysScanned });
    const slack = await sendDailySummary().catch((e: Error) => `error: ${e.message}`);
    return NextResponse.json({ ok: true, daysScanned, slack });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
