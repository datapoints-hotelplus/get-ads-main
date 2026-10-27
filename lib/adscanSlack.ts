/**
 * lib/adscanSlack.ts
 * Slack notification for the daily ADSCAN AI run. The channel is whatever the
 * Incoming Webhook URL (set by an admin at /admin/adscan-skill) is bound to.
 * Settings live in adscan_settings (migration 043); until that exists or a URL
 * is saved, notify() is a no-op and never breaks the AI run.
 */
import { getSupabase } from "@/lib/supabase";

const URL_KEY = "slack_webhook_url";
const ENABLED_KEY = "slack_enabled";
export const WEBHOOK_PREFIX = "https://hooks.slack.com/";

export type SlackSettings = { url: string | null; enabled: boolean };

export async function getSlackSettings(): Promise<SlackSettings> {
  const { data, error } = await getSupabase().from("adscan_settings").select("key,value").in("key", [URL_KEY, ENABLED_KEY]);
  if (error) return { url: null, enabled: false }; // table not created yet
  const m = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  return { url: m.get(URL_KEY) || null, enabled: m.get(ENABLED_KEY) === "true" };
}

export async function saveSlackSettings(p: { url?: string; enabled?: boolean }) {
  const rows: { key: string; value: string; updated_at: string }[] = [];
  const at = new Date().toISOString();
  if (p.url !== undefined) rows.push({ key: URL_KEY, value: p.url, updated_at: at });
  if (p.enabled !== undefined) rows.push({ key: ENABLED_KEY, value: String(p.enabled), updated_at: at });
  if (!rows.length) return;
  const { error } = await getSupabase().from("adscan_settings").upsert(rows);
  if (error) {
    throw new Error(/adscan_settings/.test(error.message) ? "ยังไม่ได้สร้างตาราง — ต้องรัน supabase/migrations/043 ใน Supabase ก่อน" : error.message);
  }
}

/** Posts `text` (Slack mrkdwn) to the configured webhook. Throws on failure. */
export async function postToSlack(url: string, text: string) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`);
}

/** Used by ai-run: sends only when enabled and a URL is saved; reports what happened instead of throwing. */
export async function notifySlack(text: string): Promise<"sent" | "off" | `error: ${string}`> {
  try {
    const s = await getSlackSettings();
    if (!s.enabled || !s.url) return "off";
    await postToSlack(s.url, text);
    return "sent";
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}
