/**
 * Self-check for ad-account-timezone date maths.
 * Run: node --experimental-strip-types lib/adDate.check.ts
 *
 * The case that matters is the one that caused the bug: between 00:00 and
 * 06:59 Bangkok time the UTC server is still on the previous day, so naive
 * `new Date()` arithmetic returns yesterday-but-one.
 */
import assert from "node:assert/strict";
import { todayIn, daysAgoIn } from "./adDate.ts";

const TZ = "Asia/Bangkok";

// What the old code did, for comparison.
const utcYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// ── shape ──
assert.match(todayIn(TZ), /^\d{4}-\d{2}-\d{2}$/, "today must be YYYY-MM-DD");
assert.match(daysAgoIn(1, TZ), /^\d{4}-\d{2}-\d{2}$/);

// ── ordering ──
assert.ok(daysAgoIn(1, TZ) < todayIn(TZ), "yesterday must sort before today");
assert.ok(daysAgoIn(30, TZ) < daysAgoIn(1, TZ), "30 days ago must sort before yesterday");
assert.equal(daysAgoIn(0, TZ), todayIn(TZ), "0 days ago is today");

// ── exact day arithmetic across a month boundary ──
const diffDays = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
assert.equal(diffDays(todayIn(TZ), daysAgoIn(1, TZ)), 1, "exactly one day apart");
assert.equal(diffDays(todayIn(TZ), daysAgoIn(30, TZ)), 30, "exactly 30 days apart");
assert.equal(diffDays(todayIn(TZ), daysAgoIn(365, TZ)), 365, "exactly 365 days apart");

// ── timezone actually changes the answer ──
// Bangkok is UTC+7, so "today in Bangkok" is never behind "today in UTC",
// and is one day ahead whenever UTC is between 17:00 and 23:59.
const bkk = todayIn(TZ);
const utc = todayIn("UTC");
assert.ok(bkk >= utc, `Bangkok (${bkk}) must never be behind UTC (${utc})`);
assert.ok(diffDays(bkk, utc) <= 1, "at most one day apart");

// ── the actual regression ──
// Between 00:00 and 06:59 Bangkok the old UTC maths is a day early. Prove the
// helper disagrees with it exactly then, and agrees the rest of the time.
const bkkHour = Number(
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()),
);
const inDangerWindow = bkkHour < 7;
const same = daysAgoIn(1, TZ) === utcYesterday();
assert.equal(
  same,
  !inDangerWindow,
  `at ${bkkHour}:00 Bangkok the helper should ${inDangerWindow ? "differ from" : "match"} the old UTC maths ` +
    `(helper=${daysAgoIn(1, TZ)}, old=${utcYesterday()})`,
);

console.log(
  `OK — adDate: ${bkkHour}:00 in Bangkok, yesterday=${daysAgoIn(1, TZ)} ` +
    `(old UTC maths said ${utcYesterday()}${same ? "" : " ← would have synced the wrong day"})`,
);
