/**
 * app/api/tiktok/export/pdf/route.ts
 * GET /api/tiktok/export/pdf?date_from&date_to&advertiser_id
 *
 * F23: server-side summary report as PDF (pdfkit — no headless browser,
 * safe to run in a serverless function). Same filters as the dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

// pdfkit's default font ("Helvetica") isn't embedded — it loads metrics from
// its own node_modules/pdfkit/js/data/Helvetica.afm at runtime via a
// __dirname-relative fs.readFileSync. Both Turbopack and webpack rewrite
// that path when bundling this route (confirmed live: ENOENT on a bogus
// "D:\ROOT\...\Helvetica.afm", in `next dev` *and* `next build`+`next start`,
// under both bundlers), so pdfkit's default font can never load and every
// PDFDocument() call throws inside its own constructor.
//
// Fix: hand pdfkit a real embedded font (a Buffer skips the AFM lookup
// entirely) instead of fighting the bundlers — read via `process.cwd()`, a
// plain runtime value the bundlers don't touch, instead of the __dirname
// path that breaks.
//
// Sarabun (SIL OFL, from Google Fonts), not next's own bundled Geist —
// ad/campaign/advertiser names are frequently Thai, and Geist has zero Thai
// glyph coverage (confirmed via fontkit: 54/54 Thai chars missing), which
// rendered as blank boxes. Sarabun covers Thai + Latin + digits.
const EMBEDDED_FONT = fs.readFileSync(path.join(process.cwd(), "public/fonts/Sarabun-Regular.ttf"));

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}
function money(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} THB`;
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const { searchParams } = req.nextUrl;

  const dateTo = searchParams.get("date_to") ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dateFrom = searchParams.get("date_from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const advertiserIds = searchParams.get("advertiser_id");
  const advFilter = advertiserIds ? advertiserIds.split(",").map((s) => s.trim()).filter(Boolean) : null;

  let query = sb
    .from("tiktok_ads_rawdata")
    .select(
      "advertiser_name,campaign_name,ad_name,spend,impressions,video_views,video_watched_2s,video_view_p50,clicks,cpm,cpc",
    )
    .gte("stat_time_day", dateFrom)
    .lte("stat_time_day", dateTo);
  if (advFilter && advFilter.length > 0) query = query.in("advertiser_id", advFilter);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totals = { spend: 0, impressions: 0, video_views: 0, watched2s: 0, viewP50: 0, clicks: 0 };
  const adMap = new Map<string, { name: string; campaign: string; advertiser: string; spend: number; views: number }>();
  for (const r of rows ?? []) {
    totals.spend += num(r.spend);
    totals.impressions += num(r.impressions);
    totals.video_views += num(r.video_views);
    totals.watched2s += num(r.video_watched_2s);
    totals.viewP50 += num(r.video_view_p50);
    totals.clicks += num(r.clicks);

    const key = `${r.advertiser_name}__${r.campaign_name}__${r.ad_name}`;
    const e = adMap.get(key);
    if (e) {
      e.spend += num(r.spend);
      e.views += num(r.video_views);
    } else {
      adMap.set(key, {
        name: String(r.ad_name ?? "—"),
        campaign: String(r.campaign_name ?? "—"),
        advertiser: String(r.advertiser_name ?? "—"),
        spend: num(r.spend),
        views: num(r.video_views),
      });
    }
  }
  const topAds = [...adMap.values()].sort((a, b) => b.spend - a.spend).slice(0, 15);

  const doc = new PDFDocument({ margin: 40, size: "A4", font: EMBEDDED_FONT as unknown as string });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  doc.fontSize(18).text("TikTok Ads — Summary Report", { align: "left" });
  doc.fontSize(10).fillColor("#666").text(`${dateFrom} to ${dateTo}`);
  doc.moveDown(1);

  doc.fillColor("#000").fontSize(12).text("KPIs", { underline: true });
  doc.moveDown(0.3);
  const kpiRows: [string, string][] = [
    ["Total Spend", money(totals.spend)],
    ["Impressions", totals.impressions.toLocaleString()],
    ["Video Views", totals.video_views.toLocaleString()],
    ["2s View Rate", totals.video_views > 0 ? `${((totals.watched2s / totals.video_views) * 100).toFixed(1)}%` : "—"],
    ["50% View Rate", totals.video_views > 0 ? `${((totals.viewP50 / totals.video_views) * 100).toFixed(1)}%` : "—"],
    ["CPM", totals.impressions > 0 ? money((totals.spend / totals.impressions) * 1000) : "—"],
    ["CPC", totals.clicks > 0 ? money(totals.spend / totals.clicks) : "—"],
  ];
  doc.fontSize(10);
  for (const [label, value] of kpiRows) {
    doc.text(`${label}:`, { continued: true, width: 200 }).text(`  ${value}`);
  }
  doc.moveDown(1);

  doc.fontSize(12).text(`Top ${topAds.length} Ads by Spend`, { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(9);
  const colX = [40, 200, 340, 440, 500];
  doc.text("Ad Name", colX[0], doc.y, { continued: false });
  doc.text("Campaign", colX[1], doc.y - 12);
  doc.text("Advertiser", colX[2], doc.y - 12);
  doc.text("Spend", colX[3], doc.y - 12);
  doc.text("Views", colX[4], doc.y - 12);
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(0.3);

  for (const a of topAds) {
    const y = doc.y;
    doc.text(a.name.slice(0, 28), colX[0], y, { width: 155 });
    doc.text(a.campaign.slice(0, 22), colX[1], y, { width: 135 });
    doc.text(a.advertiser.slice(0, 16), colX[2], y, { width: 95 });
    doc.text(money(a.spend), colX[3], y, { width: 55 });
    doc.text(a.views.toLocaleString(), colX[4], y, { width: 55 });
    doc.moveDown(0.6);
    if (doc.y > 780) doc.addPage();
  }

  doc.end();
  const pdfBuffer = await done;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tiktok-ads-report_${dateFrom}_to_${dateTo}.pdf"`,
    },
  });
}
