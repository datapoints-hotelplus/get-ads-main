/**
 * lib/adscan.ts
 * ADSCAN alert engine — pure, no DB. Takes daily ad rows from ads_rawdata and
 * the Portfolio KPI templates, returns one verdict per campaign.
 *
 *   - Which campaigns: name starts with a template's campaign_filter prefix
 *     (MES / PL / ENG …), same matching as /api/portfolio.
 *   - Thresholds: the template's green / yellow, so editing Portfolio Template
 *     changes ADSCAN too. ≤ green ok, ≤ yellow medium, worse = critical,
 *     ≥ 30% better than green = good news.
 *   - Window: the last WINDOW days that have data (not "today" — the sync can lag).
 *
 * Only cost-per-result templates are used. Reach (cost_per_result on AWN) and
 * Frequency need de-duplicated reach over the window, which daily rows can't
 * give — summing daily reach counts the same person every day.
 */

export const WINDOW = 7;
export const TREND_DAYS = 30;
export const MIN_SPEND = 100; // ponytail: one global weekly floor; per-template if small campaigns need judging
export const GOOD_MARGIN = 0.7;
export const FOLLOW_DAYS = 14;

/** Template metric → the ads_rawdata column that counts one result. */
export const RESULT_COL: Record<string, { col: keyof RawRow; label: string; metric: string }> = {
  cost_per_message: { col: "messaging_conversations_started", label: "Messages", metric: "Cost per Message" },
  cost_per_like: { col: "page_likes", label: "Page Likes", metric: "Cost per Like" },
  cost_per_engagement: { col: "post_engagement", label: "Engagements", metric: "Cost per Engagement" },
  cost_per_lead: { col: "leads", label: "Leads", metric: "Cost per Lead" },
  cost_per_purchase: { col: "purchases", label: "Purchases", metric: "Cost per Purchase" },
};

export const DONE_CHOICES = ["ปิด Ad Set / Ad", "ย้าย Budget", "ลด Budget", "ขยาย Audience", "เปลี่ยน Creative", "อื่น ๆ"];
export const SKIP_CHOICES = ["ลูกค้าสั่งให้คงไว้", "กำลังทดสอบอยู่", "ข้อมูลน่าจะไม่ถูกต้อง"];

export type RawRow = {
  account_id: string; account_name: string;
  campaign_id: string; campaign_name: string;
  adset_id: string; adset_name: string; ad_id: string; ad_name: string;
  date_start: string;
  spend: number; impressions: number; inline_link_clicks: number;
  messaging_conversations_started: number; page_likes: number; post_engagement: number; leads: number; purchases: number;
};

export type Template = {
  name: string; metric: string; direction: string;
  green_min: number | null; yellow_min: number | null;
  green_op: string; yellow_op: string; campaign_filter: string | null;
};

export type Sev = "critical" | "medium" | "good" | "ok" | "wait" | "follow";
export type Mark = "" | "bad" | "good";

export type Node = {
  name: string; sub?: string; spend: number; share: number; res: number;
  cpr: number | null; cpm: number | null; ctr: number | null; mark: Mark;
};

export type Verdict = {
  id: string; // campaign_id
  sev: Sev; kind: "issue" | "good" | "ok" | "wait";
  hotel: string; hotelId: string; campaign: string; template: string; templateMetric: string;
  metric: string; resLabel: string; green: number; yellow: number; dec: number;
  windowFrom: string; windowTo: string; dataDays: number;
  spend: number; res: number; value: number | null;
  deltaPct: number | null;
  level: "Ad Set" | "Ad"; culprit?: Node; best?: Node;
  headline: string; action: string; why: string; effect: string; analysis: string;
  dates: string[]; trend: (number | null)[]; band: [number, number] | null;
  tree: Node & { sets: (Node & { ads: Node[] })[] };
};

// ── small helpers ──
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const thDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
const cmp = (v: number, op: string, t: number) => (op === "<" ? v < t : op === ">" ? v > t : op === ">=" ? v >= t : v <= t);
export const money = (v: number | null, dec: number) => (v == null ? "—" : "฿" + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};

type Agg = { spend: number; res: number; impr: number; clicks: number };
const emptyAgg = (): Agg => ({ spend: 0, res: 0, impr: 0, clicks: 0 });
function add(a: Agg, r: RawRow, col: keyof RawRow) {
  a.spend += +r.spend || 0;
  a.res += +(r[col] as number) || 0;
  a.impr += +r.impressions || 0;
  a.clicks += +r.inline_link_clicks || 0;
}
/** Spent but got nothing = infinitely expensive, so it sorts as the worst. */
const costOf = (a: Agg) => (a.res > 0 ? a.spend / a.res : a.spend > 0 ? Infinity : null);
const node = (name: string, a: Agg, total: number, sub?: string): Node => ({
  name, sub, spend: a.spend, share: pct(a.spend, total), res: a.res,
  cpr: costOf(a), cpm: a.impr > 0 ? (a.spend / a.impr) * 1000 : null, ctr: a.impr > 0 ? (a.clicks / a.impr) * 100 : null, mark: "",
});

export function templateFor(campaignName: string, templates: Template[]): Template | null {
  return (
    templates.find(
      (t) =>
        RESULT_COL[t.metric] &&
        t.direction === "lower_better" &&
        t.green_min != null &&
        t.yellow_min != null &&
        (t.campaign_filter ?? "").split(",").map((p) => p.trim()).filter(Boolean).some((p) => campaignName.startsWith(p)),
    ) ?? null
  );
}

/**
 * One verdict per campaign that matches a template and spent in the window.
 * `latest` is the newest date_start in the data.
 */
export function evaluate(rows: RawRow[], templates: Template[], latest: string): Verdict[] {
  const windowFrom = addDays(latest, -(WINDOW - 1));
  const trendFrom = addDays(latest, -(TREND_DAYS - 1));
  const dates = Array.from({ length: TREND_DAYS }, (_, i) => addDays(trendFrom, i));

  const byCampaign = new Map<string, RawRow[]>();
  for (const r of rows) (byCampaign.get(r.campaign_id) ?? byCampaign.set(r.campaign_id, []).get(r.campaign_id)!).push(r);

  const out: Verdict[] = [];
  for (const [cid, crow] of byCampaign) {
    const first = crow[0];
    const t = templateFor(first.campaign_name, templates);
    if (!t) continue;
    const { col, label: resLabel, metric } = RESULT_COL[t.metric];
    const green = Number(t.green_min), yellow = Number(t.yellow_min);
    const dec = green < 10 ? 2 : 0;

    const win = crow.filter((r) => r.date_start >= windowFrom && r.date_start <= latest);
    const total = emptyAgg();
    win.forEach((r) => add(total, r, col));
    if (total.spend <= 0) continue; // not running this week

    // Daily campaign cost for the trend line.
    const daily = new Map<string, Agg>();
    for (const r of crow) add(daily.get(r.date_start) ?? daily.set(r.date_start, emptyAgg()).get(r.date_start)!, r, col);
    const trend = dates.map((d) => {
      const a = daily.get(d);
      return a && a.res > 0 ? a.spend / a.res : null;
    });
    const prior = dates.filter((d) => d < windowFrom).map((d) => trend[dates.indexOf(d)]).filter((v): v is number => v != null);
    const band: [number, number] | null = prior.length >= 7 ? [quantile(prior, 0.25), quantile(prior, 0.75)] : null;

    // Hierarchy for the window.
    const sets = new Map<string, { name: string; agg: Agg; ads: Map<string, { name: string; agg: Agg }> }>();
    for (const r of win) {
      const s = sets.get(r.adset_id) ?? sets.set(r.adset_id, { name: r.adset_name, agg: emptyAgg(), ads: new Map() }).get(r.adset_id)!;
      add(s.agg, r, col);
      const ad = s.ads.get(r.ad_id) ?? s.ads.set(r.ad_id, { name: r.ad_name, agg: emptyAgg() }).get(r.ad_id)!;
      add(ad.agg, r, col);
    }
    const tree = {
      ...node(first.campaign_name, total, total.spend),
      sets: [...sets.values()]
        .sort((a, b) => b.agg.spend - a.agg.spend)
        .map((s) => ({
          ...node(s.name, s.agg, total.spend, `${s.ads.size} Ad`),
          ads: [...s.ads.values()].sort((a, b) => b.agg.spend - a.agg.spend).map((ad) => node(ad.name, ad.agg, s.agg.spend)),
        })),
    };

    // Compare siblings at the level where the money splits: Ad Sets, or the
    // Ads of the only Ad Set (whose spend is the campaign's, so shares match).
    const level: "Ad Set" | "Ad" = tree.sets.length > 1 ? "Ad Set" : "Ad";
    const kids: Node[] = level === "Ad Set" ? tree.sets : tree.sets[0].ads;

    const value = costOf(total);
    const dataDays = new Set(crow.map((r) => r.date_start)).size;
    const startedRecently = crow.every((r) => r.date_start >= windowFrom);
    const base = {
      id: cid, hotel: first.account_name, hotelId: "act_" + first.account_id, campaign: first.campaign_name,
      template: t.name, templateMetric: t.metric, metric, resLabel, green, yellow, dec,
      windowFrom, windowTo: latest, dataDays, spend: total.spend, res: total.res,
      value: value === Infinity ? null : value, level, dates, trend, band, tree,
    };
    const deltaPct = value != null && value !== Infinity ? Math.round(((value - green) / green) * 100) : null;
    const fmt = (v: number | null) => (v === Infinity ? `ยังไม่มี ${resLabel}` : money(v, dec));

    if (startedRecently) {
      out.push({ ...base, kind: "wait", sev: "wait", deltaPct, headline: `เพิ่งเริ่ม ${dataDays} วัน — ต้องมีข้อมูลครบ ${WINDOW} วันก่อนตัดสิน`, action: "", why: "", effect: "", analysis: "" });
      continue;
    }
    if (total.spend < MIN_SPEND) {
      out.push({ ...base, kind: "ok", sev: "ok", deltaPct, headline: `Spend ${WINDOW} วัน ${money(total.spend, 0)} น้อยเกินกว่าจะตัดสิน`, action: "", why: "", effect: "", analysis: "" });
      continue;
    }

    const isGood = value != null && value <= green * GOOD_MARGIN;
    const sev: Sev = value == null || value === Infinity || !cmp(value, t.yellow_op, yellow) ? "critical"
      : !cmp(value, t.green_op, green) ? "medium" : isGood ? "good" : "ok";
    const kind = sev === "critical" || sev === "medium" ? "issue" : sev === "good" ? "good" : "ok";

    const priced = kids.filter((k) => k.cpr != null && k.cpr !== Infinity);
    const best = kids.length > 1 ? [...priced].sort((a, b) => a.cpr! - b.cpr!)[0] : undefined;
    const culprit = kind === "issue" && kids.length > 1
      ? [...kids].filter((k) => k.share >= 15 && k.cpr != null && k.cpr > green && k !== best).sort((a, b) => b.cpr! - a.cpr!)[0]
      : kind === "good" && kids.length > 1 ? [...priced].sort((a, b) => b.cpr! - a.cpr!).find((k) => k !== best && k.cpr! > green) : undefined;
    if (culprit) culprit.mark = "bad";
    if (best && (kind !== "issue" || best.cpr! <= green)) best.mark = "good";
    const bestOk = best?.mark === "good" ? best : undefined;

    const overDays = trend.slice(-WINDOW).filter((v) => v != null && v > green).length;
    const bandTxt = band ? ` · ช่วงก่อนหน้าอยู่ราว ${money(band[0], dec)}–${money(band[1], dec)}` : "";
    let headline = "", action = "", why = "", effect = "";
    if (kind === "issue") {
      headline = value === Infinity
        ? `ใช้งบ ${money(total.spend, 0)} แต่ยังไม่ได้ ${resLabel} เลยใน ${WINDOW} วัน`
        : `${metric} ครั้งละ ${fmt(value)} (เกณฑ์ ≤ ${money(green, dec)})`;
      if (culprit) {
        action = `ลด Budget หรือปิด ${level} “${culprit.name}”` + (bestOk ? ` แล้วย้ายไปที่ ${level} “${bestOk.name}”` : "");
        why = `${level} นี้ใช้งบ ${culprit.share}% ของ Campaign แต่ได้ ${resLabel} ${pct(culprit.res, total.res)}% — ครั้งละ ${fmt(culprit.cpr)}` +
          (bestOk ? ` ขณะที่ “${bestOk.name}” ได้ครั้งละ ${fmt(bestOk.cpr)}` : "");
        const rest = { s: total.spend - culprit.spend, r: total.res - culprit.res };
        effect = rest.r > 0 ? `ถ้าปิด ${level} นี้ และตัวอื่นได้ผลเท่าเดิม ${metric} ของ Campaign จะเหลือประมาณ ${money(rest.s / rest.r, dec)}` : "";
      } else {
        action = `ตรวจ Creative และ Audience ของทั้ง Campaign`;
        why = kids.length > 1 ? `ทุก ${level} แพงใกล้เคียงกัน ไม่มีตัวไหนฉุดชัดเจน` : `Campaign นี้มี ${level} เดียว ปัญหาอยู่ที่ตัวมันเองทั้งหมด`;
      }
    } else if (kind === "good") {
      headline = `${metric} ครั้งละ ${fmt(value)} ถูกกว่าเกณฑ์ ${Math.abs(deltaPct ?? 0)}%`;
      const star = bestOk ?? kids[0];
      action = `พิจารณาเพิ่ม Budget ให้ ${level} “${star.name}”`;
      why = `${level} นี้ใช้งบ ${star.share}% ของ Campaign และได้ ${resLabel} ${pct(star.res, total.res)}% — ครั้งละ ${fmt(star.cpr)}`;
      if (culprit) effect = `ถ้าย้ายงบจาก “${culprit.name}” (ครั้งละ ${fmt(culprit.cpr)}) มาที่ตัวนี้ จะได้ ${resLabel} มากขึ้นจากงบเท่าเดิม`;
    }
    const analysis = `${WINDOW} วันล่าสุดเกินเกณฑ์ ${overDays} วัน${bandTxt}`;

    out.push({ ...base, kind, sev, deltaPct, culprit, best: bestOk, headline, action, why, effect, analysis });
  }
  const order: Record<Sev, number> = { critical: 0, medium: 1, good: 2, wait: 3, ok: 4, follow: 5 };
  return out.sort((a, b) => order[a.sev] - order[b.sev] || b.spend - a.spend);
}

// ── Persistent alerts ──

export type Episode = {
  id?: number; campaign_id: string; account_id: string; metric: string;
  first_seen: string; last_seen: string; times_seen: number; sev: string; value: number | null;
  closed_at: string | null; close_reason: "improved" | "stopped" | null; dirty?: boolean;
};

/**
 * Apply one day's verdicts to the open episodes. Pure — exported for the check.
 * Flagged → open or extend. Not flagged → close: "improved" when the engine
 * judged it within threshold that day, "stopped" otherwise (paused, too little
 * spend to judge, or no longer matching a template).
 */
export function applyDay(open: Map<string, Episode>, created: Episode[], verdicts: Verdict[], day: string) {
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  for (const v of verdicts) {
    if (v.kind !== "issue") continue;
    const ep = open.get(v.id);
    if (ep) Object.assign(ep, { last_seen: day, times_seen: ep.times_seen + 1, sev: v.sev, value: v.value, dirty: true });
    else {
      const fresh: Episode = {
        campaign_id: v.id, account_id: v.hotelId, metric: v.templateMetric, first_seen: day, last_seen: day,
        times_seen: 1, sev: v.sev, value: v.value, closed_at: null, close_reason: null, dirty: true,
      };
      open.set(v.id, fresh);
      created.push(fresh);
    }
  }
  for (const [cid, ep] of open) {
    const v = byId.get(cid);
    if (v?.kind === "issue") continue;
    const improved = v != null && v.value != null && v.value <= v.green;
    Object.assign(ep, { closed_at: day, close_reason: improved ? "improved" : "stopped", dirty: true });
    open.delete(cid);
  }
}

