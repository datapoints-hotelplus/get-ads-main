/**
 * Self-check for the ADSCAN engine.
 * Run: node --experimental-strip-types lib/adscan.check.ts
 */
import assert from "node:assert/strict";
import { SLACK_LABELS_DEFAULT, applyDay, cleanSlackLabels, evaluate, renderSlackLine, slackHeadingError, slackLabelsFromForm, slackLineError, slackSummary, slackTemplateFromLabels, slackTemplateToLabels, type Episode, type RawRow, type Template, type Verdict } from "./adscan.ts";

const T: Template[] = [
  { name: "Message Campaign", metric: "cost_per_message", direction: "lower_better", green_min: 54, yellow_min: 66, green_op: "<=", yellow_op: "<=", campaign_filter: "MES" },
  { name: "Reach Campaign", metric: "cost_per_result", direction: "lower_better", green_min: 9, yellow_min: 11, green_op: "<=", yellow_op: "<=", campaign_filter: "AWN" },
];
const LATEST = "2026-10-12";
const day = (n: number) => new Date(Date.parse(LATEST) - n * 864e5).toISOString().slice(0, 10);
const row = (cid: string, name: string, set: string, ad: string, d: number, spend: number, msgs: number): RawRow => ({
  account_id: "1", account_name: "Hotel A", campaign_id: cid, campaign_name: name, adset_id: set, adset_name: set,
  ad_id: ad, ad_name: ad, date_start: day(d), spend, impressions: 1000, inline_link_clicks: 10,
  messaging_conversations_started: msgs, page_likes: 0, post_engagement: 0, leads: 0, purchases: 0,
});
const rows: RawRow[] = [];
for (let d = 0; d < 30; d++) {
  rows.push(row("bad", "MES | Hotel A", "Interest", "ad1", d, 300, 2));    // ฿150 each
  rows.push(row("bad", "MES | Hotel A", "Retarget", "ad2", d, 100, 3));    // ฿33 each
  rows.push(row("good", "MES | Cheap", "S", "ad3", d, 100, 4));            // ฿25 each
  rows.push(row("zero", "MES | Nothing", "S", "ad4", d, 100, 0));          // spends, no messages
  rows.push(row("awn", "AWN | Reach", "S", "ad5", d, 100, 0));             // reach template unsupported
  rows.push(row("x", "Random campaign", "S", "ad6", d, 100, 1));           // no template
}
for (let d = 0; d < 3; d++) rows.push(row("new", "MES | New", "S", "ad7", d, 500, 5));

const v = Object.fromEntries(evaluate(rows, T, LATEST).map((x) => [x.id, x]));

// ฿80 blended > yellow ฿66 → critical; the ฿150 Ad Set is the culprit, the ฿33 one the fix
assert.equal(v.bad.sev, "critical");
assert.equal(Math.round(v.bad.value!), 80);
assert.equal(v.bad.level, "Ad Set");
assert.equal(v.bad.culprit?.name, "Interest");
assert.equal(v.bad.best?.name, "Retarget");
assert.equal(v.bad.tree.sets.find((s) => s.name === "Interest")?.mark, "bad", "culprit is marked in the tree the UI draws");
assert.match(v.bad.effect, /฿33/, "without the culprit the campaign costs what Retarget costs");
assert.equal(v.bad.trend.length, 30);

assert.equal(v.good.sev, "good", "฿25 ≤ 70% of ฿54");
assert.equal(v.zero.sev, "critical", "spend with zero results is the worst case, not skipped");
assert.equal(v.zero.value, null);
assert.equal(v.new.sev, "critical", "a 3-day-old campaign is judged at once (฿100 > yellow ฿66), like Portfolio");
assert.equal(v.awn, undefined, "Reach template needs de-duplicated reach — not judged from daily rows");
assert.equal(v.x, undefined, "campaign with no matching prefix is ignored");

// tiny spend is not "waiting for data" — it's just not judged
const tiny = evaluate([...Array(30)].map((_, d) => row("t", "MES | Tiny", "S", "a", d, 5, 0)), T, LATEST)[0];
assert.equal(tiny.sev, "ok", "฿35/week is below MIN_SPEND → not judged, not shown as an issue");

// medium: between green and yellow
const mid = evaluate([...Array(30)].map((_, d) => row("m", "MES | Mid", "S", "a", d, 60, 1)), T, LATEST)[0];
assert.equal(mid.sev, "medium", "฿60: over green ฿54, within yellow ฿66");

// ── persistent episodes ──
const open = new Map<string, Episode>();
const created: Episode[] = [];
const issue = { ...v.bad };                       // critical on day 1 and 2
const fine = { ...v.bad, kind: "ok", sev: "ok", value: 40 } as Verdict; // within green ฿54
applyDay(open, created, [issue], "2026-10-01");
applyDay(open, created, [issue], "2026-10-02");
assert.equal(created.length, 1, "same campaign two days running = one episode");
assert.equal(created[0].times_seen, 2, "แจ้งครั้งที่ 2");
assert.equal(created[0].first_seen, "2026-10-01");
applyDay(open, created, [fine], "2026-10-03");
assert.equal(created[0].close_reason, "improved", "closes only when the metric is back within threshold");
applyDay(open, created, [issue], "2026-10-04");
assert.equal(created.length, 2, "relapse opens a new episode");
applyDay(open, created, [], "2026-10-05");
assert.equal(created[1].close_reason, "stopped", "campaign gone from the data = stopped, not improved");

// ── Slack summary: names every campaign, puts each in the right group ──
{
  const ep = (cid: string, o: Partial<Episode>): Episode => ({
    campaign_id: cid, account_id: "1", metric: "cost_per_message", first_seen: "2026-10-26", last_seen: "2026-10-26",
    times_seen: 1, sev: "critical", value: 80, closed_at: null, close_reason: null, ...o,
  });
  const names = new Map([
    ["c1", { hotel: "Hotel A", campaign: "MES Oct" }],
    ["c2", { hotel: "Hotel B", campaign: "AWN Reach" }],
    ["c3", { hotel: "Hotel C", campaign: "MES Sep" }],
  ]);
  const text = slackSummary({
    day: "2026-10-26",
    created: [ep("c1", {})],
    touched: [
      ep("c2", { account_id: "act_2", first_seen: "2026-10-20" }),
      ep("c3", { account_id: "3", first_seen: "2026-10-20", closed_at: "2026-10-26", close_reason: "improved" }),
      ep("c4", { account_id: "3", first_seen: "2026-10-20", sev: "medium" }),
    ],
    names, owners: new Map([["1", ["LEEM"]], ["2", ["OAM", "BEER"]]]), link: "https://x.test/adscan",
  });
  assert.match(text, /ข้อมูลวันที่ 26 ต\.ค\. 2569/);
  assert.match(text, /\*พบปัญหาใหม่ 1 แคมเปญ\*\n\n\*Account: LEEM\*\n• Hotel A — MES Oct \(ต้นทุนต่อข้อความ สูงเกินเกณฑ์, เร่งด่วน\)/);
  assert.match(text, /\*ยังไม่ได้แก้ 1 แคมเปญ\*\n\n\*Account: BEER\*\n• Hotel B — AWN Reach \(.*เร่งด่วน, ค้างมา 7 วัน\)\n\n\*Account: OAM\*\n• Hotel B/, "shared account: under each owner, counted once");
  assert.doesNotMatch(text, /Hotel C/, "only red: recovered (c3) and yellow (c4) campaigns are not sent");
  assert.doesNotMatch(text, /:[a-z_]+:/, "no emoji codes");
  assert.match(text, /<https:\/\/x\.test\/adscan\|ADSCAN>$/);

  // answered (แก้แล้ว / ไม่แก้) within FOLLOW_DAYS → left out of Slack; nothing left = the "empty" line
  const actedText = slackSummary({
    day: "2026-10-26", created: [ep("c1", {})], touched: [ep("c2", { account_id: "act_2", first_seen: "2026-10-20" })],
    names, owners: new Map(), link: null, acted: new Set(["c1", "c2"]),
  });
  assert.doesNotMatch(actedText, /Hotel A|Hotel B/, "an answered campaign is not sent while it is being followed up");
  assert.ok(actedText.includes(SLACK_LABELS_DEFAULT.empty));

  // admin-edited wording replaces the fixed text; anything left unset keeps the default
  const custom = slackSummary({
    day: "2026-10-26", created: [ep("c1", {})], touched: [], names, owners: new Map(), link: null,
    labels: cleanSlackLabels({ title: "*รายงาน {date}*", fresh: "เรื่องใหม่", noOwner: "ไม่มีเจ้าของ", footer: "เปิดดูที่ {link}", bogus: "x", pending: "   " }),
  });
  assert.match(custom, /^\*รายงาน 26 ต\.ค\. 2569\*\n\n\*เรื่องใหม่ 1 แคมเปญ\*\n\n\*Account: ไม่มีเจ้าของ\*/);
  assert.match(custom, /เปิดดูที่ หน้า ADSCAN$/, "{link} falls back when the site URL is unknown");
  assert.deepEqual(cleanSlackLabels({ bogus: "x", title: 5, fresh: "a".repeat(500) }), { fresh: "a".repeat(200) }, "unknown keys and non-strings dropped, length capped");

  // line format: reorder, drop, and punctuation tidy-up when a value doesn't apply
  assert.equal(slackLineError("{hotel} {nope} {campaign}"), "ไม่รู้จักตัวแปร {nope} — ใช้ได้เฉพาะ {hotel} {campaign} {metric} {status} {severity} {days}");
  assert.match(slackLineError("{n}. {campaign}") ?? "", /ไม่รู้จักตัวแปร \{n\}.*หัวโรงแรม/, "{n} in the campaign line points to the heading field");
  assert.match(slackLineError("{hotel} only") ?? "", /ต้องมี \{campaign\}/);
  assert.equal(slackLineError("{campaign} @ {hotel}"), null);
  assert.equal(renderSlackLine("{campaign} @ {hotel} · {severity} · {days}", { campaign: "C", hotel: "H", severity: "ควรดู" }), "C @ H · ควรดู ·", "empty {days} leaves only the plain separator");
  assert.equal(renderSlackLine("[{severity}] {hotel} — {campaign} {days}", { hotel: "H", campaign: "C" }), "H — C", "empty [] is dropped too");
  assert.equal(renderSlackLine(SLACK_LABELS_DEFAULT.line, { hotel: "H", campaign: "C", metric: "M", status: "S" }), "H — C (M S)", "default format on a row with no severity/days");
  assert.deepEqual(cleanSlackLabels({ line: "{hotel} {nope}", sort: "bogus", group: "hotel" }), { group: "hotel" }, "invalid line/sort ignored, valid group kept");

  // group by hotel and sort by age (oldest first), flat list when group is "none"
  const eps = [
    ep("c1", { account_id: "1", first_seen: "2026-10-22" }),
    ep("c2", { account_id: "act_2", first_seen: "2026-10-10" }),
    ep("c3", { account_id: "3", first_seen: "2026-10-01" }),
  ];
  const base = { day: "2026-10-26", created: [], touched: eps, names, owners: new Map<string, string[]>(), link: null };
  const byHotel = slackSummary({ ...base, labels: { group: "hotel", sort: "age" } });
  assert.match(byHotel, /\*Hotel A\*\n• Hotel A — MES Oct/);
  assert.match(byHotel, /\*Hotel B\*\n• Hotel B — AWN Reach/);
  assert.doesNotMatch(byHotel, /Account:/);
  const flat = slackSummary({ ...base, labels: { group: "none", sort: "age" } });
  assert.match(flat, /แคมเปญ\*\n• Hotel C — MES Sep.*\n• Hotel B — AWN Reach.*\n• Hotel A — MES Oct/, "oldest first, no group headers");
  assert.doesNotMatch(flat, /Account:/);

  // owner › numbered hotel: hotels ordered by their top campaign, numbering restarts per owner, no blank line right after the owner
  const two = slackSummary({
    ...base, owners: new Map([["1", ["BEER"]], ["2", ["BEER"]], ["3", ["OAM"]]]),
    labels: { group: "owner_hotel", sort: "age", line: "{campaign} ({metric} {status})" },
  });
  assert.match(two, /\*Account: BEER\*\n1\. Hotel B\n• AWN Reach \(ต้นทุนต่อข้อความ สูงเกินเกณฑ์\)\n\n2\. Hotel A\n• MES Oct \(/, "oldest hotel first, numbered");
  assert.match(two, /\*Account: OAM\*\n1\. Hotel C\n• MES Sep/, "numbering restarts per owner");
  const bold = slackSummary({ ...base, owners: new Map([["1", ["BEER"]]]), labels: { group: "owner_hotel", hotelHeading: "*{n}) {hotel}*" } });
  assert.match(bold, /\*Account: BEER\*\n\*1\) Hotel A\*\n• /, "hotel heading is editable");
  const hg = slackSummary({ ...base, labels: { group: "hotel", sort: "age", hotelGroup: "{n}) {hotel}" } });
  assert.match(hg, /\n1\) Hotel A\n• .*\n\n2\) Hotel B\n• .*\n\n3\) Hotel C\n• /, "hotel-only heading is editable, numbered (hotels A–Z)");
  // one-textarea template: default round-trips, structure lines decide the grouping, mistakes point at the line
  const tpl = slackTemplateFromLabels({});
  assert.equal(tpl, "*สรุปแคมเปญที่ต้องดูแล ข้อมูลวันที่ {date}*\n\n*{section} {count} แคมเปญ*\n\n*Account: {owner}*\n{hotel} — {campaign} ({metric} {status}, {severity}, {days})\n\nดูรายละเอียดได้ที่ {link}");
  const back = slackTemplateToLabels(tpl);
  assert.equal(back.error, null);
  assert.equal(back.labels.group, "owner");
  assert.equal(back.labels.line, SLACK_LABELS_DEFAULT.line);
  assert.equal(slackSummary({ ...base, labels: back.labels }), slackSummary(base), "default template renders the same message");

  const target = "*สรุป {date}*\n\n*{section} {count} แคมเปญ*\n\n*Account: {owner}*\n{n}. {hotel}\n{campaign} ({metric} {status})\n\nท้าย {link}";
  const t2 = slackTemplateToLabels(target);
  assert.equal(t2.labels.group, "owner_hotel", "owner + hotel heading lines = owner › hotel");
  assert.equal(t2.labels.line, "{campaign} ({metric} {status})");
  assert.equal(slackTemplateToLabels(target.replace("{n}. {hotel}\n", "")).labels.group, "owner", "no hotel heading line = owner only");
  assert.equal(slackTemplateToLabels(target.replace("*Account: {owner}*\n", "")).labels.group, "hotel", "no owner heading line = hotel only");
  assert.equal(slackTemplateToLabels(target.replace("*Account: {owner}*\n", "").replace("{n}. {hotel}\n", "")).labels.group, "none");
  assert.match(slackTemplateToLabels("*x*\n*{section}*\n{hotel}\n{owner}\n{campaign}").error ?? "", /บรรทัดที่ 4: ลำดับต้องเป็น/, "wrong order is refused with the line number");
  assert.match(slackTemplateToLabels("*{section}*\n{campaign}\n{campaign}").error ?? "", /บรรทัดที่ 3: มีบรรทัดแคมเปญซ้ำ/);
  assert.match(slackTemplateToLabels("*{section}*\n{campaign} {n}").error ?? "", /บรรทัดแคมเปญ: ไม่รู้จักตัวแปร \{n\}/, "{n} is not a campaign-line variable");
  assert.match(slackTemplateToLabels("*{section}*\nplain text").error ?? "", /ไม่พบบรรทัดโครงสร้าง|ต้องมีบรรทัดแคมเปญ/);
  assert.match(slackTemplateToLabels("*{section}*\n{hotel}\nstray\n{campaign}").error ?? "", /บรรทัดที่ 3 “stray” ไม่รู้ว่าเป็นส่วนไหน/);
  // no section heading line = one merged list; the {status} / {days} in each line still tell the kinds apart
  const mergedTpl = target.replace("*{section} {count} แคมเปญ*\n\n", "");
  const m = slackTemplateToLabels(mergedTpl);
  assert.equal(m.error, null, "section heading is optional");
  assert.equal(m.labels.sections, "merged");
  assert.equal(slackTemplateFromLabels(m.labels).includes("{section}"), false, "merged template shows no section line");
  const mergedOut = slackSummary({
    ...base, created: [ep("c1", { account_id: "1" })], touched: [ep("c2", { account_id: "act_2", first_seen: "2026-10-20" })],
    owners: new Map([["1", ["BEER"]], ["2", ["BEER"]]]), labels: { ...m.labels, line: "{campaign} ({status}, {days})" },
  });
  assert.doesNotMatch(mergedOut, /แคมเปญ\*\n/, "no section heading");
  assert.match(mergedOut, /\*Account: BEER\*\n1\. Hotel B\n• AWN Reach \(สูงเกินเกณฑ์, ค้างมา 7 วัน\)\n\n2\. Hotel A\n• MES Oct \(สูงเกินเกณฑ์\)/, "new + pending under one owner, one list, oldest first");
  assert.equal((mergedOut.match(/Account:/g) ?? []).length, 1, "owner heading appears once, not once per section");
  assert.match(slackTemplateToLabels("*x*\n{hotel}\n{owner}\n{campaign}").error ?? "", /ลำดับต้องเป็น/);
  assert.equal(slackTemplateToLabels("*x*\n{hotel}\n{owner}\n{campaign}").line, 3, "error carries the line number");
  // form: the template decides structure, the small fields still apply, no template = plain labels
  const form = slackLabelsFromForm({ template: target, fresh: "ใหม่", group: "none", line: "ignored {campaign}" });
  assert.equal(form.labels.fresh, "ใหม่");
  assert.equal(form.labels.group, "owner_hotel", "template wins over a stale group field");
  assert.equal(form.labels.line, "{campaign} ({metric} {status})");
  assert.deepEqual(slackLabelsFromForm({ fresh: "ใหม่" }).labels, { fresh: "ใหม่" });
  assert.deepEqual(slackLabelsFromForm({}).labels, {}, "empty form = reset to defaults");
  assert.equal(slackHeadingError("{n}. no hotel"), "หัวโรงแรมต้องมี {hotel}");
  assert.match(slackHeadingError("{n} {hotel} {x}") ?? "", /ไม่รู้จักตัวแปร \{x\}/);
  assert.deepEqual(cleanSlackLabels({ hotelHeading: "{n}. nope" }), {}, "invalid heading ignored");
}

console.log("OK — adscan: persistent episodes, severity bands, culprit/best, effect, new campaigns judged at once, zero-result, unsupported templates, slack summary");

