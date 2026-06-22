import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { getSupabase } from "@/lib/supabase";

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

// POST /api/admin/fix-campaign-names
// ลบ record เก่าที่ campaign_name เปลี่ยนแล้ว โดยเก็บเฉพาะชื่อล่าสุด (date_start ล่าสุด)
export async function POST() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  // 1. ดึง ad_id ทั้งหมดที่มี campaign_name มากกว่า 1 ชื่อ
  const { data: allRows, error: fetchErr } = await supabase
    .from("ads_rawdata")
    .select("ad_id, campaign_name, date_start")
    .order("date_start", { ascending: false })
    .limit(200000);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // 2. Group by ad_id → หา campaign_name ล่าสุด (date_start สูงสุด)
  const adLatestCampaign = new Map<string, string>();
  for (const row of (allRows ?? []) as { ad_id: string; campaign_name: string; date_start: string }[]) {
    if (!adLatestCampaign.has(row.ad_id)) {
      // เรียงมาแล้ว desc ดังนั้นอันแรกคือ latest
      adLatestCampaign.set(row.ad_id, row.campaign_name);
    }
  }

  // 3. หา ad_id ที่มีชื่อเก่าอยู่ใน db (ต่างจากชื่อล่าสุด)
  const toDelete = new Map<string, string[]>(); // ad_id → [old_campaign_names]
  for (const row of (allRows ?? []) as { ad_id: string; campaign_name: string; date_start: string }[]) {
    const latestName = adLatestCampaign.get(row.ad_id);
    if (latestName && row.campaign_name !== latestName) {
      if (!toDelete.has(row.ad_id)) toDelete.set(row.ad_id, []);
      const names = toDelete.get(row.ad_id)!;
      if (!names.includes(row.campaign_name)) names.push(row.campaign_name);
    }
  }

  if (toDelete.size === 0) {
    return NextResponse.json({ message: "ไม่พบข้อมูลที่ต้องแก้ไข", deleted: 0 });
  }

  // 4. ลบ record เก่าทีละ ad_id
  let totalDeleted = 0;
  const errors: string[] = [];
  const fixed: { ad_id: string; kept: string; removed: string[] }[] = [];

  const CHUNK = 50;
  const adIds = [...toDelete.keys()];

  for (let i = 0; i < adIds.length; i += CHUNK) {
    const chunkIds = adIds.slice(i, i + CHUNK);

    for (const adId of chunkIds) {
      const oldNames = toDelete.get(adId)!;
      const latestName = adLatestCampaign.get(adId)!;

      const { error: delErr, count } = await supabase
        .from("ads_rawdata")
        .delete({ count: "exact" })
        .eq("ad_id", adId)
        .in("campaign_name", oldNames);

      if (delErr) {
        errors.push(`ad_id=${adId}: ${delErr.message}`);
      } else {
        totalDeleted += count ?? 0;
        fixed.push({ ad_id: adId, kept: latestName, removed: oldNames });
      }
    }
  }

  return NextResponse.json({
    message: `ลบ record เก่าทั้งหมด ${totalDeleted} แถว จาก ${toDelete.size} ads`,
    deleted: totalDeleted,
    affected_ads: toDelete.size,
    fixed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
