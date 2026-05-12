import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/debug-db?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  const supabase = getSupabase();

  // Get rows with purchase_value > 0
  let q1 = supabase
    .from("ads_rawdata")
    .select(
      "date_start, account_name, campaign_name, spend, purchases, purchase_value",
    )
    .gt("purchase_value", 0)
    .order("purchase_value", { ascending: false })
    .limit(10);
  if (dateFrom) q1 = q1.gte("date_start", dateFrom);
  if (dateTo) q1 = q1.lte("date_start", dateTo);

  const { data: hasPurchase, error: e1 } = await q1;

  // Get all rows count in range
  let q2 = supabase
    .from("ads_rawdata")
    .select("*", { count: "exact", head: true });
  if (dateFrom) q2 = q2.gte("date_start", dateFrom);
  if (dateTo) q2 = q2.lte("date_start", dateTo);
  const { count: totalRows } = await q2;

  // Get rows with spend > 0 but purchase_value = 0
  let q3 = supabase
    .from("ads_rawdata")
    .select("*", { count: "exact", head: true })
    .gt("spend", 0)
    .eq("purchase_value", 0);
  if (dateFrom) q3 = q3.gte("date_start", dateFrom);
  if (dateTo) q3 = q3.lte("date_start", dateTo);
  const { count: zeroPurchaseRows } = await q3;

  // Get rows with purchases > 0 (count) but check purchase_value
  let q4 = supabase
    .from("ads_rawdata")
    .select(
      "date_start, account_name, campaign_name, spend, purchases, purchase_value",
    )
    .gt("purchases", 0)
    .order("date_start", { ascending: false })
    .limit(10);
  if (dateFrom) q4 = q4.gte("date_start", dateFrom);
  if (dateTo) q4 = q4.lte("date_start", dateTo);
  const { data: hasPurchaseCount } = await q4;

  // Sum totals
  let q5 = supabase.from("ads_rawdata").select("spend, purchase_value");
  if (dateFrom) q5 = q5.gte("date_start", dateFrom);
  if (dateTo) q5 = q5.lte("date_start", dateTo);
  const { data: allRows } = await q5;

  const totals = (allRows ?? []).reduce(
    (acc, r) => {
      acc.spend += parseFloat(String(r.spend ?? 0));
      acc.purchase_value += parseFloat(String(r.purchase_value ?? 0));
      return acc;
    },
    { spend: 0, purchase_value: 0 },
  );

  let diagnosis = "";
  if (totalRows === 0) {
    diagnosis = "❌ ไม่มีข้อมูลใน DB เลยในช่วงเวลานี้";
  } else if (totals.purchase_value === 0) {
    diagnosis = `❌ DB มี ${totalRows} rows แต่ purchase_value = 0 ทั้งหมด → ต้อง re-sync หรือ Facebook ไม่มีข้อมูล purchase`;
  } else {
    diagnosis = `✅ DB มี purchase_value = ${totals.purchase_value.toFixed(2)}, spend = ${totals.spend.toFixed(2)}, ROAS = ${(totals.purchase_value / totals.spend).toFixed(2)}x`;
  }

  return NextResponse.json({
    dateRange: { from: dateFrom, to: dateTo },
    counts: {
      totalRows,
      rowsWithSpendButZeroPurchaseValue: zeroPurchaseRows,
      rowsWithPurchaseValueGt0: hasPurchase?.length ?? 0,
    },
    totals,
    diagnosis,
    samplesWithPurchaseValue: hasPurchase ?? [],
    samplesWithPurchaseCount: hasPurchaseCount ?? [],
    errors: { e1: e1?.message },
  });
}
