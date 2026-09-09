/**
 * Self-check for CSV building.
 * Run: node --experimental-strip-types app/components/csv.check.ts
 *
 * The cases that matter are the ones that corrupt a spreadsheet silently:
 * a comma inside a campaign name shifting every later column, an embedded
 * quote ending the field early, and a newline splitting one row into two.
 */
import assert from "node:assert/strict";
import { csvEscape, buildCsv } from "./csv.ts";

// ── escaping ──
assert.equal(csvEscape("plain"), '"plain"');
assert.equal(csvEscape(1234.5), '"1234.5"');
assert.equal(csvEscape(null), '""', "null must not print the word 'null'");
assert.equal(csvEscape(undefined), '""');
assert.equal(csvEscape("ENG | Hotel, Bangkok"), '"ENG | Hotel, Bangkok"', "comma stays inside the quoted field");
assert.equal(csvEscape('He said "hi"'), '"He said ""hi"""', "quotes are doubled, not dropped");
assert.equal(csvEscape("line1\nline2"), '"line1\nline2"', "newline stays inside the quoted field");
assert.equal(csvEscape("โรงแรม"), '"โรงแรม"', "Thai text passes through unchanged");

// ── whole document ──
const csv = buildCsv(
  ["campaign", "spend"],
  [
    ["ENG | A, B", 100],
    ['Quote "X"', 0],
  ],
);
assert.ok(csv.startsWith("﻿"), "must start with a BOM so Excel detects UTF-8");
const body = csv.slice(1).split("\r\n");
assert.equal(body.length, 3, "header + 2 rows");
assert.equal(body[0], '"campaign","spend"');
assert.equal(body[1], '"ENG | A, B","100"');
assert.equal(body[2], '"Quote ""X""","0"');

// A row containing a comma must still parse as exactly 2 fields.
const fields = body[1].match(/"(?:[^"]|"")*"/g) ?? [];
assert.equal(fields.length, 2, "comma inside a value must not create a third column");

console.log("OK — csv: escaping, BOM, quoting, and column integrity all pass");
