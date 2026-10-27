/**
 * lib/adscanData.ts
 * Loads everything ADSCAN shows for one user, scoped to the ad accounts they
 * may see. This is where "can't cross portfolios even knowing the URL" holds:
 * rows, alerts and actions are all read only for the user's own accounts.
 */
import { getSupabase } from "@/lib/supabase";
import type { Role } from "@/lib/access";
import { FOLLOW_DAYS, TREND_DAYS, evaluate, type RawRow, type Template, type Verdict } from "@/lib/adscan";
import { EXCLUDED_ACCOUNTS, RAW_COLS as COLS, addDays, scanPending } from "@/lib/adscanScan";

export type Action = {
  id: number; campaign_id: string; account_id: string; type: "fixed" | "skipped"; label: string;
  metric: string; value_at: number | null; created_at: string; by: string;
};
export type AdscanAlert = Verdict & {
  status: "open" | "fixed" | "skipped"; actions: Action[];
  /** Open episode: days since first flagged (ค้างมา N วัน) and days flagged (แจ้งครั้งที่ N). */
  daysOpen: number | null; timesSeen: number | null;
};
export type AdscanPayload = {
  latestDate: string | null;
  hotels: { id: string; name: string }[];
  alerts: AdscanAlert[];
  actions: Action[];
  /** Name of the migration still to run, if a table is missing. */
  needsMigration?: string;
};

export async function loadAdscan(userId: string, role: Role): Promise<AdscanPayload> {
  const sb = getSupabase();
  // Bring persistent alerts up to date with the newest data first.
  let needsMigration: string | undefined;
  try {
    await scanPending();
  } catch (e) {
    if (!/adscan_(alerts|scans)/.test((e as Error).message)) throw e;
    needsMigration = "042_adscan_alerts_skills.sql";
  }

  // Accounts this user may see: admin → every active account; specialist → own grants.
  const { data: pages, error: pErr } = await sb.from("ads_allpage").select("account_id,account_name").eq("is_active", true);
  if (pErr) throw new Error(pErr.message);
  let allowed = (pages ?? []).filter((p) => !EXCLUDED_ACCOUNTS.has(p.account_id));
  if (role !== "admin") {
    const { data: grants, error } = await sb.from("ads_user_page_permissions").select("account_id").eq("user_id", userId);
    if (error) throw new Error(error.message);
    const mine = new Set((grants ?? []).map((g) => g.account_id as string));
    allowed = allowed.filter((p) => mine.has(p.account_id));
  }
  const hotels = allowed.map((p) => ({ id: p.account_id as string, name: p.account_name as string }));
  const empty: AdscanPayload = { latestDate: null, hotels, alerts: [], actions: [], needsMigration };
  if (!allowed.length) return empty;
  const bare = allowed.map((p) => (p.account_id as string).replace(/^act_/, ""));

  const { data: last } = await sb.from("ads_rawdata").select("date_start").in("account_id", bare)
    .order("date_start", { ascending: false }).limit(1).maybeSingle();
  const latest = last?.date_start as string | undefined;
  if (!latest) return empty;
  const from = addDays(latest, -(TREND_DAYS - 1));

  const rows: RawRow[] = [];
  for (let off = 0; ; off += 1000) {
    // Stable order is required for .range() pagination (see /api/portfolio).
    const { data, error } = await sb.from("ads_rawdata").select(COLS).in("account_id", bare)
      .gte("date_start", from).lte("date_start", latest).order("id").range(off, off + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as RawRow[]));
    if ((data ?? []).length < 1000) break;
  }

  const { data: templates, error: tErr } = await sb.from("ads_portfolio_templates").select("*").order("created_at");
  if (tErr) throw new Error(tErr.message);

  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const { data: acts, error: aErr } = await sb.from("adscan_actions").select("*")
    .in("account_id", allowed.map((p) => p.account_id)).gte("created_at", since).order("created_at", { ascending: false });
  // Table not created yet: still show alerts, just nothing recorded.
  if (aErr && !/adscan_actions/.test(aErr.message)) throw new Error(aErr.message);
  if (aErr) needsMigration = "041_adscan_actions.sql";

  const { data: eps } = needsMigration
    ? { data: [] }
    : await sb.from("adscan_alerts").select("campaign_id,first_seen,times_seen").is("closed_at", null).in("account_id", allowed.map((p) => p.account_id));
  const episode = new Map((eps ?? []).map((e) => [e.campaign_id as string, e]));
  const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const userIds = [...new Set((acts ?? []).map((a) => a.user_id as string))];
  const { data: users } = userIds.length
    ? await sb.from("ads_users").select("id,username,display_name").in("id", userIds)
    : { data: [] as { id: string; username: string; display_name: string | null }[] };
  const nameOf = new Map((users ?? []).map((u) => [u.id, u.display_name || u.username]));
  const actions: Action[] = (acts ?? []).map((a) => ({
    id: a.id, campaign_id: a.campaign_id, account_id: a.account_id, type: a.type, label: a.label,
    metric: a.metric, value_at: a.value_at, created_at: a.created_at, by: nameOf.get(a.user_id) ?? "—",
  }));

  const cutoff = Date.now() - FOLLOW_DAYS * 864e5;
  const alerts = evaluate(rows, (templates ?? []) as Template[], latest).map((v): AdscanAlert => {
    const mine = actions.filter((a) => a.campaign_id === v.id);
    const recent = mine.find((a) => Date.parse(a.created_at) >= cutoff); // newest first
    const ep = v.kind === "issue" ? episode.get(v.id) : undefined;
    return {
      ...v, status: recent ? recent.type : "open", actions: mine,
      daysOpen: ep ? dayDiff(ep.first_seen, latest) + 1 : null, timesSeen: ep ? ep.times_seen : null,
    };
  });
  return { latestDate: latest, hotels, alerts, actions, needsMigration };
}
