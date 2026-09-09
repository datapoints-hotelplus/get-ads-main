/**
 * Conversion between the ISO date strings every API/filter in this app passes
 * around ("2026-09-08") and the dd/mm/yyyy text people actually read.
 *
 * Split out from DateInput.tsx so it can be exercised without a browser —
 * see dateFormat.check.ts, runnable with `node --experimental-strip-types`.
 */

/** "2026-09-08" → "08/09/2026". Anything else → "" (renders as an empty box). */
export function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * "08/09/2026" → "2026-09-08". Returns null for anything that isn't a real
 * calendar date, so a half-typed or impossible value (31/02/2026) leaves the
 * caller's committed value untouched rather than writing a bad date.
 *
 * Accepts 1- or 2-digit day/month so typing "8/9/2026" works.
 */
export function displayToIso(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((text ?? "").trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  // Date() happily rolls 2026-02-31 over into March, so round-trip it back and
  // insist the string survived unchanged — that's what rejects impossible days.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === iso ? iso : null;
}
