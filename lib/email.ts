/**
 * lib/email.ts
 * Alert emails via the Resend HTTP API (no SDK — it's one fetch call) — F04, F27.
 * Requires RESEND_API_KEY (from https://resend.com — API Keys page) and
 * EMAIL_FROM (must be on a domain verified in Resend) in the environment;
 * silently no-ops (logs a warning) if unset, so missing config never breaks
 * a sync.
 *
 * Recipients come from tiktok_alert_settings (admin-editable at
 * /tiktok/sync) — this same hardcoded pair is just the DB row's default,
 * see supabase/migrations/033_tiktok_alert_settings.sql. Falls back to it
 * directly if the table's missing/empty so a bad settings row never means
 * alerts go nowhere.
 */

import { getSupabase } from "./supabase";

const FALLBACK_RECIPIENTS = ["datapoints@hotelplus.asia", "marcom@hotelplus.asia"];

async function getAlertRecipients(): Promise<string[]> {
  try {
    const { data } = await getSupabase()
      .from("tiktok_alert_settings")
      .select("recipients")
      .eq("id", 1)
      .maybeSingle();
    if (Array.isArray(data?.recipients) && data.recipients.length > 0) return data.recipients;
  } catch {
    // best-effort — fall through to the hardcoded default
  }
  return FALLBACK_RECIPIENTS;
}

export async function sendAlertEmail(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn(
      "[email] RESEND_API_KEY / EMAIL_FROM not set — skipping alert email:",
      subject,
    );
    return;
  }

  const to = await getAlertRecipients();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[email] Resend send failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[email] Resend send threw:", err);
  }
}
