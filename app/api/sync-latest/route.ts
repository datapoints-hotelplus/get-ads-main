import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { runSync } from "@/app/api/sync-7days/route";

export async function GET() {
  const supabase = getSupabase();

  // หาวันล่าสุดที่มีข้อมูลใน ads_rawdata
  const { data, error } = await supabase
    .from("ads_rawdata")
    .select("date_start")
    .order("date_start", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const latestDate = data?.date_start as string | undefined;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

  // ถ้าไม่มีข้อมูลเลย ดึงแค่วันนี้
  const since = latestDate ?? today;
  const until = today;

  if (since > until) {
    return NextResponse.json(
      { error: "ข้อมูลล่าสุดอยู่ในอนาคต ตรวจสอบ database" },
      { status: 400 },
    );
  }

  try {
    const result = await runSync(since, until, "sync-latest");
    return NextResponse.json({ success: true, latestDate, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
