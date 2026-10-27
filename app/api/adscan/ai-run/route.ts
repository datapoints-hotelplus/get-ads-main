import { NextResponse } from "next/server";
import { isAuthorizedSyncCaller } from "@/lib/syncAuth";
import { loadAdscan } from "@/lib/adscanData";
import { generateFor } from "@/lib/adscanAi";
import { notifySlack } from "@/lib/adscanSlack";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/adscan/ai-run — n8n at 09:00 (Bearer SYNC_TRIGGER_SECRET) or an admin.
 * Runs the AI once for every campaign that is currently an issue and stores the
 * text; users only read it back. Safe to call twice: stored ones are skipped.
 */
export async function POST(req: Request) {
  if (!(await isAuthorizedSyncCaller(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await loadAdscan("cron", "admin"); // admin = every active account
    if (!data.latestDate) return NextResponse.json({ ok: true, generated: 0, skipped: 0, failed: [] });
    let generated = 0, skipped = 0;
    const failed: { id: string; error: string }[] = [];
    // ponytail: sequential — gentle on the AI provider's rate limit; parallelise if it outgrows maxDuration.
    for (const a of data.alerts.filter((x) => x.kind === "issue")) {
      try {
        if (await generateFor(a, data.latestDate)) generated++;
        else skipped++;
      } catch (e) {
        failed.push({ id: a.id, error: (e as Error).message });
      }
    }
    // Tell the Slack channel (set by an admin) when the run actually did something;
    // a repeat call that only skipped stored ones stays quiet. Never fails the run.
    let slack: string = "off";
    if (generated > 0 || failed.length > 0) {
      const link = `${new URL(req.url).origin}/adscan`;
      slack = await notifySlack(
        [
          failed.length ? ":warning: *ADSCAN AI วิเคราะห์เสร็จ (มีบางรายการล้มเหลว)*" : ":white_check_mark: *ADSCAN AI วิเคราะห์เสร็จแล้ว*",
          `วันข้อมูล ${data.latestDate} · สร้างคำแนะนำใหม่ ${generated} · ข้าม (มีอยู่แล้ว) ${skipped} · ล้มเหลว ${failed.length}`,
          ...failed.slice(0, 5).map((f) => `• ${f.id}: ${f.error}`),
          `<${link}|เปิดหน้า ADSCAN>`,
        ].join("\n"),
      );
    }
    return NextResponse.json({ ok: failed.length === 0, generated, skipped, failed, slack });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
