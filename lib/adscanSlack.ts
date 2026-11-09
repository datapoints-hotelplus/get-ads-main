/**
 * lib/adscanSlack.ts
 * Slack notification sent when n8n calls POST /api/adscan/scan. The channel is whatever the
 * Incoming Webhook URL (set by an admin at /admin/adscan-skill) is bound to.
 * Settings live in adscan_settings (migration 043); until that exists or a URL
 * is saved, notifySlack() is a no-op and never breaks the scan.
 */
import { getSupabase } from "@/lib/supabase";
import { SLACK_LABELS_DEFAULT, cleanSlackLabels, type SlackLabels } from "@/lib/adscan";

const LABELS_KEY = "slack_labels";
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

/** Wording the admin edited at /admin/adscan-skill (JSON in adscan_settings); empty = defaults. */
export async function getSlackLabels(): Promise<Partial<SlackLabels>> {
  const { data, error } = await getSupabase().from("adscan_settings").select("value").eq("key", LABELS_KEY).maybeSingle();
  if (error || !data?.value) return {}; // table not created yet, or never edited
  try {
    return cleanSlackLabels(JSON.parse(data.value as string));
  } catch {
    return {};
  }
}

/** Saves the given wording; an empty object resets everything to the defaults. */
export async function saveSlackLabels(all: Partial<SlackLabels>) {
  const sb = getSupabase();
  // Keep only what differs from the defaults, so untouched fields follow future default changes.
  const labels = Object.fromEntries(Object.entries(all).filter(([k, v]) => v !== SLACK_LABELS_DEFAULT[k as keyof SlackLabels]));
  const { error } = Object.keys(labels).length
    ? await sb.from("adscan_settings").upsert({ key: LABELS_KEY, value: JSON.stringify(labels), updated_at: new Date().toISOString() })
    : await sb.from("adscan_settings").delete().eq("key", LABELS_KEY);
  if (error) throw new Error(error.message);
}

/** Posts `text` (Slack mrkdwn) to the configured webhook. Throws on failure. */
export async function postToSlack(url: string, text: string) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`);
}

/** Sends only when enabled and a URL is saved; reports what happened instead of throwing. */
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
