/**
 * lib/adscanScan.ts
 * Persistent alerts: replays the engine once per data date and keeps one
 * episode per campaign while it stays flagged (TOR: an alert only goes away
 * when the metric actually improves).
 *
 * Runs lazily — loadAdscan() calls it whenever the newest data date hasn't
 * been scanned yet — so no extra cron is needed; POST /api/adscan/scan forces
 * it (n8n after sync, or an admin). The first run backfills BACKFILL_DAYS.
 * Scanning never posts to Slack — see sendDailySummary().
 */
import { getSupabase } from "@/lib/supabase";
import { FOLLOW_DAYS, FREQ_PREFIX, TREND_DAYS, WINDOW, applyDay, evaluate, evaluateFrequency, frequencyTemplate, slackSummary, type AccountReach, type Episode, type RawRow, type SlackLabels, type Template, type Verdict } from "@/lib/adscan";
import { getSlackLabels, getSlackSettings, notifySlack } from "@/lib/adscanSlack";
import { fetchAccountReachByAccount } from "@/lib/facebook";
import { getFacebookAccessToken } from "@/lib/facebook-token";

export const BACKFILL_DAYS = 90;
export const EXCLUDED_ACCOUNTS = new Set(["act_1378870469122933"]); // H+ Marcom — internal, not a client hotel
export const RAW_COLS =
  "account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,spend,impressions,inline_link_clicks,messaging_conversations_started,page_likes,post_engagement,leads,purchases";

export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/**
 * Hotel-level Frequency for one data date: the de-duplicated reach of the last
 * WINDOW days from Facebook (account level, same call as Portfolio), one request
 * per account that spent — none at all when Portfolio has no Frequency template.
 * Stored in adscan_freq so the page never calls Facebook. `failed` = accounts
 * whose call failed: their open alerts must be left alone, not closed.
 * Throws when Facebook can't be used at all; the caller then skips Frequency for the day.
 */
async function frequencyFor(day: string, rows: RawRow[], templates: Template[]): Promise<{ verdicts: Verdict[]; failed: Set<string> } | null> {
  if (!frequencyTemplate(templates)) return null;
  const from = addDays(day, -(WINDOW - 1));
  const accounts = [...new Set(rows.filter((r) => r.date_start >= from && r.date_start <= day && +r.spend > 0).map((r) => r.account_id))];
  if (!accounts.length) return { verdicts: [], failed: new Set() };
  const token = await getFacebookAccessToken();
  if (!token) throw new Error("no Facebook token");
  const reach = new Map<string, AccountReach>();
  const failed = new Set<string>();
  // One call per account so a revoked / erroring account doesn't hide the rest.
  await Promise.all(accounts.map(async (id) => {
    try {
      const r = (await fetchAccountReachByAccount([`act_${id}`], token, from, day)).get(`act_${id}`);
      if (r && r.reach > 0) reach.set(id, r);
    } catch (e) {
      failed.add(id);
      console.error(`[adscan] frequency: reach failed for act_${id}:`, (e as Error).message);
    }
  }));
  if (reach.size) {
    const { error } = await getSupabase().from("adscan_freq").upsert(
      [...reach].map(([account_id, r]) => ({ account_id, data_date: day, reach: r.reach, impressions: r.impressions })),
      { onConflict: "account_id,data_date" },
    );
    if (error) console.error("[adscan] frequency: could not store reach (migration 046?):", error.message);
  }
  return { verdicts: evaluateFrequency(rows, templates, reach, day), failed };
}

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
  const { data: templates } = await sb.from("ads_portfolio_templates").select("*").order("sort_order").order("created_at");
  const { data: openRows, error: oErr } = await sb.from("adscan_alerts").select("*").is("closed_at", null);
  if (oErr) throw new Error(oErr.message);

  const open = new Map<string, Episode>((openRows ?? []).map((e) => [e.campaign_id as string, e as Episode]));
  const touched = new Set<Episode>(open.values());
  const created: Episode[] = [];
  // Hotel Frequency alerts follow their own rule: only the newest day has Facebook reach (no backfill),
  // so they are applied once, on that day — and never closed by the cost verdicts of the other days.
  const openFreq = new Map([...open].filter(([id]) => id.startsWith(FREQ_PREFIX)));
  for (const id of openFreq.keys()) open.delete(id);
  const lastDay = todo[todo.length - 1];
  let freq: Awaited<ReturnType<typeof frequencyFor>> = null;
  try {
    freq = await frequencyFor(lastDay, rows, (templates ?? []) as Template[]);
  } catch (e) {
    // ponytail: a failed day isn't retried (the day is already claimed); tomorrow's scan picks Frequency up again.
    console.error("[adscan] frequency skipped for", lastDay, (e as Error).message);
  }
  for (const day of todo) {
    const from = addDays(day, -(TREND_DAYS - 1));
    const slice = rows.filter((r) => r.date_start >= from && r.date_start <= day);
    applyDay(open, created, evaluate(slice, (templates ?? []) as Template[], day), day);
    if (freq && day === lastDay) {
      const held = [...openFreq].filter(([, e]) => freq!.failed.has(e.account_id.replace(/^act_/, "")));
      for (const [id] of held) openFreq.delete(id);
      applyDay(openFreq, created, freq.verdicts, day);
    }
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
  return todo.length;
}

/** Bare account id → active Specialists holding it (ads_user_page_permissions), for the Slack grouping. */
async function loadOwners(): Promise<Map<string, string[]>> {
  const sb = getSupabase();
  const { data: users, error: uErr } = await sb.from("ads_users").select("id,username,display_name").eq("role", "specialist").eq("is_active", true);
  if (uErr) throw new Error(uErr.message);
  const label = new Map((users ?? []).map((u) => [u.id as string, (u.display_name || u.username) as string]));
  const { data: grants, error: gErr } = await sb.from("ads_user_page_permissions").select("user_id,account_id").in("user_id", [...label.keys()]);
  if (gErr) throw new Error(gErr.message);
  const owners = new Map<string, string[]>();
  for (const g of grants ?? []) {
    const id = (g.account_id as string).replace(/^act_/, "");
    owners.set(id, [...(owners.get(id) ?? []), label.get(g.user_id as string)!]);
  }
  return owners;
}

/**
 * The daily Slack message. Only POST /api/adscan/scan calls this, on n8n's
 * Bearer token — a page open may scan first, but never posts. One message per
 * data date: the claim row makes a repeated n8n run a no-op, and a failed post
 * gives the claim back so the next run retries.
 */
export async function sendDailySummary(): Promise<"sent" | "already" | "off" | "nothing"> {
  const s = await getSlackSettings();
  if (!s.enabled || !s.url) return "off";
  const sb = getSupabase();
  const { data: last } = await sb.from("adscan_scans").select("data_date").order("data_date", { ascending: false }).limit(1).maybeSingle();
  const day = last?.data_date as string | undefined;
  if (!day) return "nothing";
  const key = `slack_sent_${day}`;
  const { data: claimed, error } = await sb.from("adscan_settings")
    .upsert({ key, value: "true" }, { onConflict: "key", ignoreDuplicates: true }).select("key");
  if (error) throw new Error(error.message);
  if (!claimed?.length) return "already";
  try {
    await sendSummary(day);
    return "sent";
  } catch (e) {
    await sb.from("adscan_settings").delete().eq("key", key);
    throw e;
  }
}

/** Build and post the summary for one scanned data date. */
async function sendSummary(day: string): Promise<void> {
  const result = await notifySlack(await buildSummary(day));
  if (result === "off") throw new Error("ยังไม่ได้เปิดการแจ้งเตือน Slack หรือยังไม่ได้บันทึก Webhook URL");
  if (result !== "sent") throw new Error(result.replace(/^error: /, ""));
}

/** The summary text for the newest scanned date, with the given (unsaved) wording. Sends nothing. */
export async function previewSummary(labels: Partial<SlackLabels>): Promise<string | null> {
  const { data: last } = await getSupabase().from("adscan_scans").select("data_date").order("data_date", { ascending: false }).limit(1).maybeSingle();
  return last?.data_date ? buildSummary(last.data_date as string, labels) : null;
}

async function buildSummary(day: string, labels?: Partial<SlackLabels>): Promise<string> {
  const sb = getSupabase();
  // Open episodes only: recovered / stopped campaigns are no longer sent to Slack.
  const { data: open, error: oErr } = await sb.from("adscan_alerts").select("*").is("closed_at", null);
  if (oErr) throw new Error(oErr.message);
  const eps = (open ?? []) as Episode[];

  const names = new Map<string, { hotel: string; campaign: string }>();
  const ids = [...new Set(eps.map((e) => e.campaign_id))];
  for (let off = 0; ids.length; off += 1000) {
    const { data, error } = await sb.from("ads_rawdata").select("campaign_id,campaign_name,account_name")
      .in("campaign_id", ids).gte("date_start", addDays(day, -(TREND_DAYS - 1))).order("date_start").range(off, off + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) names.set(r.campaign_id as string, { hotel: r.account_name as string, campaign: r.campaign_name as string }); // newest wins
    if ((data ?? []).length < 1000) break;
  }

  // Hotel Frequency alerts have no campaign in ads_rawdata: name them after the hotel.
  const freqIds = ids.filter((id) => id.startsWith(FREQ_PREFIX));
  if (freqIds.length) {
    const { data, error } = await sb.from("ads_allpage").select("account_id,account_name").in("account_id", freqIds.map((id) => "act_" + id.slice(FREQ_PREFIX.length)));
    if (error) throw new Error(error.message);
    for (const p of data ?? []) names.set(FREQ_PREFIX + (p.account_id as string).replace(/^act_/, ""), { hotel: p.account_name as string, campaign: "Frequency ทั้งโรงแรม" });
  }

  // Answered (แก้แล้ว / ไม่แก้) in the last FOLLOW_DAYS days → left out, as on the ADSCAN page.
  const acted = new Set<string>();
  if (ids.length) {
    const { data: acts, error: aErr } = await sb.from("adscan_actions").select("campaign_id")
      .in("campaign_id", ids).gte("created_at", new Date(Date.now() - FOLLOW_DAYS * 864e5).toISOString());
    if (aErr) throw new Error(aErr.message);
    for (const a of acts ?? []) acted.add(a.campaign_id as string);
  }

  const site = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  return slackSummary({
    day, created: eps.filter((e) => e.first_seen === day), touched: eps.filter((e) => e.first_seen !== day),
    names, owners: await loadOwners(), link: site ? `${site}/adscan` : null,
    labels: labels ?? (await getSlackLabels()), acted,
  });
}
