import { NextRequest, NextResponse } from "next/server";
import { WEBHOOK_PREFIX, getSlackSettings, postToSlack, saveSlackSettings } from "@/lib/adscanSlack";
import { sendLatestSummary } from "@/lib/adscanScan";
import { logAccess } from "@/lib/accessLog";

export const dynamic = "force-dynamic";

const mask = (u: string) => `${WEBHOOK_PREFIX}…${u.slice(-4)}`;

/** GET /api/admin/adscan-settings — Slack status. Never returns the full webhook URL. Admin only (proxy). */
export async function GET() {
  const s = await getSlackSettings();
  return NextResponse.json({ enabled: s.enabled, hasUrl: !!s.url, urlMasked: s.url ? mask(s.url) : null });
}

/**
 * POST /api/admin/adscan-settings
 *   { url?: string, enabled?: boolean }  → save
 *   { action: "test" }                   → post a test message with the saved URL
 *   { action: "summary" }                → re-send the latest scan's summary (no rescan)
 * Every call is written to ads_user_access_logs (who, IP, when) — shown on /admin/logs.
 */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { action?: string; url?: string; enabled?: boolean };
  try {
    // Logged before acting so a click that then fails still shows who pressed it.
    await logAccess(req,
      b.action === "test" ? "adscan_slack_test"
      : b.action === "summary" ? "adscan_slack_summary"
      : b.url !== undefined ? "adscan_slack_save_url"
      : b.enabled === true ? "adscan_slack_enable"
      : b.enabled === false ? "adscan_slack_disable" : "adscan_slack_save");
    if (b.action === "test") {
      const s = await getSlackSettings();
      if (!s.url) return NextResponse.json({ error: "ยังไม่ได้บันทึก Webhook URL" }, { status: 400 });
      await postToSlack(s.url, "ทดสอบการแจ้งเตือนจาก ADSCAN ถ้าเห็นข้อความนี้ แปลว่าเชื่อมต่อกับ channel นี้เรียบร้อยแล้ว");
      return NextResponse.json({ ok: true });
    }
    if (b.action === "summary") {
      return NextResponse.json({ ok: true, day: await sendLatestSummary() });
    }
    let url: string | undefined;
    if (b.url !== undefined) {
      url = b.url.trim();
      if (url && !url.startsWith(WEBHOOK_PREFIX)) {
        return NextResponse.json({ error: `Webhook URL ต้องขึ้นต้นด้วย ${WEBHOOK_PREFIX}` }, { status: 400 });
      }
    }
    await saveSlackSettings({ url, enabled: typeof b.enabled === "boolean" ? b.enabled : undefined });
    const s = await getSlackSettings();
    return NextResponse.json({ enabled: s.enabled, hasUrl: !!s.url, urlMasked: s.url ? mask(s.url) : null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
