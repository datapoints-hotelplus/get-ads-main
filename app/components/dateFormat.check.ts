/**
 * Self-check for the dd/mm/yyyy ↔ ISO conversion behind DateInput.
 * Run: node --experimental-strip-types app/components/dateFormat.check.ts
 *
 * The interesting cases are the rejections: a half-typed date or an
 * impossible one (31/02) must return null so the committed value is left
 * alone, instead of silently becoming a different day.
 */
import assert from "node:assert/strict";
import { isoToDisplay, displayToIso } from "./dateFormat.ts";

// ── ISO → display ──
assert.equal(isoToDisplay("2026-09-08"), "08/09/2026");
assert.equal(isoToDisplay("2026-12-31"), "31/12/2026");
assert.equal(isoToDisplay(""), "", "empty stays empty, never 'NaN/NaN/NaN'");
assert.equal(isoToDisplay("08/09/2026"), "", "already-display input is not re-parsed");

// ── display → ISO ──
assert.equal(displayToIso("08/09/2026"), "2026-09-08");
assert.equal(displayToIso("8/9/2026"), "2026-09-08", "single digits accepted while typing");
assert.equal(displayToIso(" 08/09/2026 "), "2026-09-08", "surrounding spaces tolerated");
assert.equal(displayToIso("29/02/2024"), "2024-02-29", "real leap day accepted");

// ── rejections: must not corrupt the committed value ──
for (const bad of ["", "08", "08/", "08/09", "08/09/20", "31/02/2026", "29/02/2026", "32/01/2026", "01/13/2026", "aa/bb/cccc", "2026-09-08"]) {
  assert.equal(displayToIso(bad), null, `should reject ${JSON.stringify(bad)}`);
}

// ── round trip ──
for (const iso of ["2026-01-01", "2026-02-28", "2024-02-29", "2026-06-15", "2026-12-31"]) {
  assert.equal(displayToIso(isoToDisplay(iso)), iso, `round trip failed for ${iso}`);
}

console.log("OK — dateFormat: display, parse, rejections, and round trip all pass");
