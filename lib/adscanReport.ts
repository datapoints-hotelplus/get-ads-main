/**
 * lib/adscanReport.ts
 * Performance Report — how each Marcom user handles alerts (TOR ส่วนที่ 5).
 * Returns per-person numbers only: no campaign, hotel or ad metric ever
 * leaves this function, so HR can see it without seeing ad data.
 */
import { getSupabase } from "@/lib/supabase";
import { toRole } from "@/lib/access";

export type StaffRow = {
  name: string; role: string; hotels: number;
  received: number;     // alert episodes on their hotels during the period
  handled: number;      // of those, recorded by this person
  pending: number;      // still open with nobody recording anything
  pendingDays: number | null; // average age of those
  daysToAct: number | null;   // average days from first flagged to their record
  fixed: number; improved: number; stillBad: number; skipped: number;
  improvedRate: number | null; // improved / fixed that have a verdict
  topSkip: string | null;
};
export type Report = { days: number; since: string; latestDate: string | null; staff: StaffRow[] };

const dayDiff = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5));
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

export async function loadReport(days: number): Promise<Report> {
  const sb = getSupabase();
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

  const [{ data: users }, { data: grants }, { data: eps, error: eErr }, { data: acts, error: aErr }, { data: last }] = await Promise.all([
    sb.from("ads_users").select("id,username,display_name,role").eq("is_active", true).in("role", ["admin", "specialist"]),
    sb.from("ads_user_page_permissions").select("user_id,account_id"),
    sb.from("adscan_alerts").select("id,campaign_id,account_id,first_seen,closed_at,close_reason")
      .or(`closed_at.is.null,closed_at.gte.${since}`),
    sb.from("adscan_actions").select("user_id,campaign_id,type,label,created_at").gte("created_at", since),
    sb.from("adscan_scans").select("data_date").order("data_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const missing = [eErr, aErr].find((e) => e && /adscan_(alerts|actions)/.test(e.message));
  if (missing) throw new Error("ยังไม่ได้สร้างตาราง — ต้องรัน supabase/migrations/041 และ 042 ใน Supabase ก่อน");
  if (eErr) throw new Error(eErr.message);
  if (aErr) throw new Error(aErr.message);
  const latest = (last?.data_date as string | undefined) ?? null;
  const today = latest ?? new Date().toISOString().slice(0, 10);

  const episodes = eps ?? [];
  const actions = acts ?? [];
  // The episode an action belongs to: same campaign, opened on/before the action.
  const episodeOf = (cid: string, at: string) =>
    episodes.filter((e) => e.campaign_id === cid && e.first_seen <= at.slice(0, 10)).sort((a, b) => (a.first_seen < b.first_seen ? 1 : -1))[0];
  const actedOn = new Set(actions.map((a) => episodeOf(a.campaign_id, a.created_at)?.id).filter(Boolean));

  // Admins aren't listed: they see every hotel and aren't the ones being measured.
  const staff = (users ?? []).filter((u) => toRole(u.role) !== "admin").map((u): StaffRow => {
    const mine = new Set((grants ?? []).filter((g) => g.user_id === u.id).map((g) => g.account_id as string));
    const received = episodes.filter((e) => mine.has(e.account_id));
    const myActs = actions.filter((a) => a.user_id === u.id);
    const pending = received.filter((e) => e.closed_at == null && !actedOn.has(e.id));
    const fixed = myActs.filter((a) => a.type === "fixed").map((a) => episodeOf(a.campaign_id, a.created_at));
    const improved = fixed.filter((e) => e?.close_reason === "improved").length;
    const stillBad = fixed.filter((e) => e && e.closed_at == null).length;
    const skips = myActs.filter((a) => a.type === "skipped");
    const reasons = new Map<string, number>();
    skips.forEach((s) => reasons.set(s.label, (reasons.get(s.label) ?? 0) + 1));
    const judged = improved + stillBad;
    return {
      name: u.display_name || u.username, role: "Specialist", hotels: mine.size,
      received: received.length,
      handled: new Set(myActs.map((a) => episodeOf(a.campaign_id, a.created_at)?.id).filter(Boolean)).size,
      pending: pending.length, pendingDays: avg(pending.map((e) => dayDiff(e.first_seen, today) + 1)),
      daysToAct: avg(myActs.flatMap((a) => {
        const e = episodeOf(a.campaign_id, a.created_at);
        return e ? [dayDiff(e.first_seen, a.created_at.slice(0, 10))] : [];
      })),
      fixed: fixed.length, improved, stillBad, skipped: skips.length,
      improvedRate: judged ? Math.round((improved / judged) * 100) : null,
      topSkip: [...reasons].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    };
  });
  return { days, since, latestDate: latest, staff: staff.sort((a, b) => b.pending - a.pending || b.received - a.received) };
}
