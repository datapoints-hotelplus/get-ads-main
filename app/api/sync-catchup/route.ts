import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { runSync } from "@/app/api/sync-7days/route";

// GET /api/sync-catchup
// หาวันล่าสุดใน ads_rawdata แล้ว sync ต่อจากวันถัดไปถึงเมื่อวาน
export async function GET() {
  try {
    const supabase = getSupabase();

    // หาวันล่าสุดใน ads_rawdata
    const { data, error } = await supabase
      .from("ads_rawdata")
      .select("date_start")
      .order("date_start", { ascending: false })
      .limit(1)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const lastDate = new Date(data.date_start);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // normalize to Bangkok timezone date string
    const toDateStr = (d: Date) =>
      d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

    const lastStr = toDateStr(lastDate);
    const yesterdayStr = toDateStr(yesterday);

    // ถ้าข้อมูลครบแล้ว ไม่ต้อง sync
    if (lastStr >= yesterdayStr) {
      return NextResponse.json({
        success: true,
        message: "ข้อมูลเป็นปัจจุบันแล้ว",
        last_date: lastStr,
        synced_days: 0,
      });
    }

    // since = วันถัดจาก lastDate
    const sinceDate = new Date(lastDate);
    sinceDate.setDate(sinceDate.getDate() + 1);
    const sinceStr = toDateStr(sinceDate);

    console.log(`[sync-catchup] last=${lastStr}, syncing ${sinceStr} → ${yesterdayStr}`);

    const result = await runSync(sinceStr, yesterdayStr, "sync-catchup");

    return NextResponse.json({
      success: true,
      last_date: lastStr,
      since: sinceStr,
      until: yesterdayStr,
      synced_days: result.accounts.length > 0 ? Math.ceil((yesterday.getTime() - sinceDate.getTime()) / 86400000) + 1 : 0,
      accounts: result.accounts,
    });
  } catch (e: any) {
    const detail = e?.response?.data?.error?.message ?? e?.response?.data ?? e?.message ?? String(e);
    console.error("[sync-catchup] error:", detail);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
