/**
 * CSV building + browser download, shared by the dashboards' Export buttons.
 *
 * Deliberately client-side: the page already holds every row matching the
 * current filters (the tables paginate in the browser, they don't re-query),
 * so exporting from that state is guaranteed to match what the user is
 * looking at. A server route would have to re-run the dashboard's whole
 * aggregation — including its live Facebook reach lookups — and any drift
 * between the two would show up as an export that disagrees with the screen.
 */

/** One CSV cell: quoted, with embedded quotes doubled per RFC 4180. */
export function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

export function buildCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ];
  // Leading BOM so Excel reads Thai/UTF-8 correctly instead of mangling it —
  // same reason as app/api/tiktok/export/csv/route.ts.
  return "﻿" + lines.join("\r\n");
}

/** Trigger a browser download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking immediately can cancel the download in some browsers; one tick
  // later is enough for the click to have been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
