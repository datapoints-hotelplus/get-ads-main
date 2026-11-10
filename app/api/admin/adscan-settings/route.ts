import { NextRequest, NextResponse } from "next/server";
import { WEBHOOK_PREFIX, getSlackLabels, getSlackSettings, saveSlackLabels, saveSlackSettings } from "@/lib/adscanSlack";
import { SLACK_LABELS_DEFAULT, slackLabelsFromForm, slackTemplateFromLabels } from "@/lib/adscan";
import { previewSummary } from "@/lib/adscanScan";
import { logAccess } from "@/lib/accessLog";

export const dynamic = "force-dynamic";

const mask = (u: string) => `${WEBHOOK_PREFIX}…${u.slice(-4)}`;

async function status() {
  const s = await getSlackSettings();
  const saved = await getSlackLabels();
  return {
    enabled: s.enabled, hasUrl: !!s.url, urlMasked: s.url ? mask(s.url) : null,
    labels: { ...SLACK_LABELS_DEFAULT, ...saved }, labelDefaults: SLACK_LABELS_DEFAULT,
    template: slackTemplateFromLabels(saved), // the whole message as the one editable text
  };
}

/** GET /api/admin/adscan-settings — Slack status + message wording. Never returns the full webhook URL. Admin only (proxy). */
export async function GET() {
  return NextResponse.json(await status());
}

/**
 * POST /api/admin/adscan-settings
 *   { url?: string, enabled?: boolean }  → save
 *   { labels: { template, fresh, … } }   → save the message ({} = back to defaults); `template` is the whole message as text
 *   { previewLabels: {...} }             → the message built from live data with that wording; sends and saves nothing
 * Every save is written to ads_user_access_logs (who, IP, when) — shown on /admin/logs.
 */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { url?: string; enabled?: boolean; labels?: unknown; previewLabels?: unknown };
  try {
    if (b.previewLabels !== undefined || b.labels !== undefined) {
      // Say why a bad template is refused (line number + reason) instead of silently using defaults.
      const { labels, error, line } = slackLabelsFromForm(b.previewLabels ?? b.labels);
      if (error) return NextResponse.json({ error, line }, { status: 400 });
      if (b.previewLabels !== undefined) {
        const text = await previewSummary(labels);
        return NextResponse.json({ text: text ?? "ยังไม่มีข้อมูลที่ตรวจแล้ว จึงยังสร้างตัวอย่างไม่ได้" });
      }
      await logAccess(req, "adscan_slack_labels_save");
      await saveSlackLabels(labels);
      return NextResponse.json(await status());
    }
    // Logged before acting so a click that then fails still shows who pressed it.
    await logAccess(req,
      b.url !== undefined ? "adscan_slack_save_url"
      : b.enabled === true ? "adscan_slack_enable"
      : b.enabled === false ? "adscan_slack_disable" : "adscan_slack_save");
    let url: string | undefined;
    if (b.url !== undefined) {
      url = b.url.trim();
      if (url && !url.startsWith(WEBHOOK_PREFIX)) {
        return NextResponse.json({ error: `Webhook URL ต้องขึ้นต้นด้วย ${WEBHOOK_PREFIX}` }, { status: 400 });
      }
    }
    await saveSlackSettings({ url, enabled: typeof b.enabled === "boolean" ? b.enabled : undefined });
    return NextResponse.json(await status());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
