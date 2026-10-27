/**
 * Self-check for the ADSCAN engine.
 * Run: node --experimental-strip-types lib/adscan.check.ts
 */
import assert from "node:assert/strict";
import { applyDay, evaluate, type Episode, type RawRow, type Template, type Verdict } from "./adscan.ts";

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
assert.equal(v.new.sev, "wait", "started within the window → not judged yet");
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

console.log("OK — adscan: persistent episodes, severity bands, culprit/best, effect, wait, zero-result, unsupported templates");

