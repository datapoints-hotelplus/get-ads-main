/**
 * lib/adscanScan.ts
 * Persistent alerts: replays the engine once per data date and keeps one
 * episode per campaign while it stays flagged (TOR: an alert only goes away
 * when the metric actually improves).
 *
 * Runs lazily — loadAdscan() calls it whenever the newest data date hasn't
 * been scanned yet — so no extra cron is needed; POST /api/adscan/scan forces
 * it (n8n after sync, or an admin). The first run backfills BACKFILL_DAYS.
 */
import { getSupabase } from "@/lib/supabase";
import { TREND_DAYS, applyDay, evaluate, type Episode, type RawRow, type Template } from "@/lib/adscan";
import { notifySlack } from "@/lib/adscanSlack";

export const BACKFILL_DAYS = 90;
export const EXCLUDED_ACCOUNTS = new Set(["act_1378870469122933"]); // H+ Marcom — internal, not a client hotel
export const RAW_COLS =
  "account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,spend,impressions,inline_link_clicks,messaging_conversations_started,page_likes,post_engagement,leads,purchases";

export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** Scan every unscanned data date up to the newest one in ads_rawdata. Returns days applied. */
export async function scanPending(): Promise<number> {
  const sb = getSupabase();
  const { data: last } = await sb.from("ads_rawdata").select("date_start").order("date_start", { ascending: false }).limit(1).maybeSingle();
  const latest = last?.date_start as string | undefined;
  if (!latest) return 0;
  const floor = addDays(latest, -(BACKFILL_DAYS - 1));
  const { data: done, error: dErr } = await sb.from("adscan_scans").select("data_date").gte("data_date", floor);
  if (dErr) throw new Error(dErr.message);
  const lastDone = (done ?? []).map((d) => d.data_date as string).sort().at(-1);
  const start = lastDone ? addDays(lastDone, 1) : floor;
  if (start > latest) return 0;

  const days: string[] = [];
  for (let d = start; d <= latest; d = addDays(d, 1)) days.push(d);
  // Claim the days first; a concurrent request that loses the race skips them.
  // ponytail: day-level claim only — two scanners on interleaved ranges could
  // reorder, fine at this traffic; a DB advisory lock if it ever isn't.
  const { data: claimed, error: cErr } = await sb.from("adscan_scans")
    .upsert(days.map((data_date) => ({ data_date })), { onConflict: "data_date", ignoreDuplicates: true }).select("data_date");
  if (cErr) throw new Error(cErr.message);
  const mine = new Set((claimed ?? []).map((c) => c.data_date as string));
  const todo = days.filter((d) => mine.has(d));
  if (!todo.length) return 0;

  const { data: pages } = await sb.from("ads_allpage").select("account_id").eq("is_active", true);
  const bare = (pages ?? []).map((p) => p.account_id as string).filter((id) => !EXCLUDED_ACCOUNTS.has(id)).map((id) => id.replace(/^act_/, ""));

  const rows: RawRow[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from("ads_rawdata").select(RAW_COLS).in("account_id", bare)
      .gte("date_start", addDays(todo[0], -(TREND_DAYS - 1))).lte("date_start", latest).order("id").range(off, off + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as RawRow[]));
    if ((data ?? []).length < 1000) break;
  }
  const { data: templates } = await sb.from("ads_portfolio_templates").select("*");
  const { data: openRows, error: oErr } = await sb.from("adscan_alerts").select("*").is("closed_at", null);
  if (oErr) throw new Error(oErr.message);

  const open = new Map<string, Episode>((openRows ?? []).map((e) => [e.campaign_id as string, e as Episode]));
  const touched = new Set<Episode>(open.values());
  const created: Episode[] = [];
  for (const day of todo) {
    const from = addDays(day, -(TREND_DAYS - 1));
    const slice = rows.filter((r) => r.date_start >= from && r.date_start <= day);
    applyDay(open, created, evaluate(slice, (templates ?? []) as Template[], day), day);
  }

  const strip = (e: Episode) => ({
    campaign_id: e.campaign_id, account_id: e.account_id, metric: e.metric, first_seen: e.first_seen, last_seen: e.last_seen,
    times_seen: e.times_seen, sev: e.sev, value: e.value, closed_at: e.closed_at, close_reason: e.close_reason,
  });
  if (created.length) {
    const { error } = await sb.from("adscan_alerts").insert(created.map(strip));
    if (error) throw new Error(error.message);
  }
  for (const ep of touched) {
    if (!ep.dirty || ep.id == null) continue;
    const { error } = await sb.from("adscan_alerts").update(strip(ep)).eq("id", ep.id);
    if (error) throw new Error(error.message);
  }

  // Slack (if an admin turned it on): once per newly scanned data date — the
  // claim above means only one scanner gets here, whether n8n or a page open.
  const all = [...touched, ...created];
  const site = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  await notifySlack(
    [
      `:mag: *ADSCAN ตรวจข้อมูลวันที่ ${latest} เสร็จแล้ว*`,
      `Alert ใหม่ ${created.filter((e) => e.first_seen === latest && e.closed_at == null).length} · ยังเปิดอยู่ทั้งหมด ${all.filter((e) => e.closed_at == null).length} · ดีขึ้นจนปิดไป ${[...touched].filter((e) => e.closed_at != null).length}`,
      site ? `<${site}/adscan|เปิดหน้า ADSCAN> (คำแนะนำ AI จะวิเคราะห์ตอนเปิดดูแต่ละเรื่อง)` : "เปิดหน้า ADSCAN เพื่อดูรายละเอียด (คำแนะนำ AI จะวิเคราะห์ตอนเปิดดูแต่ละเรื่อง)",
    ].join("\n"),
  );
  return todo.length;
}
