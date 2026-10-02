/**
 * app/api/tiktok/check-accounts/route.ts
 * GET /api/tiktok/check-accounts
 *
 * ตรวจสอบ Access Token และดึงรายชื่อ Advertiser ทั้งหมด
 * ไม่บันทึกอะไรลง DB — ใช้แค่ preview/validate เท่านั้น
 * ใช้ fetchAllAdvertisers จาก lib/tiktok-ads เพื่อรองรับ auto-refresh
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllAdvertisers, formatTikTokError } from "@/lib/tiktok-ads";
import { getTikTokAccessToken } from "@/lib/tiktok-token";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  // ?token= override is for manual testing only — bypass auto-refresh path
  const tokenOverride = searchParams.get("token");
  if (tokenOverride) {
    if (tokenOverride.startsWith("rft.")) {
      return NextResponse.json(
        { error: "token ที่ส่งมาเป็น Refresh Token (rft.) ไม่ใช่ Access Token" },
        { status: 400 },
      );
    }
    // For manual test tokens just return a preview without calling the API
    return NextResponse.json({
      ok: true,
      note: "token override — use without ?token= to run full check with auto-refresh",
      token_preview: `${tokenOverride.slice(0, 8)}…${tokenOverride.slice(-4)}`,
    });
  }

  try {
    const advertisers = await fetchAllAdvertisers();

    // Preview the token actually in use (the stored one), not whatever .env
    // happens to hold — showing the env value here made this check report a
    // different credential than every real API call was using.
    const token = await getTikTokAccessToken();
    return NextResponse.json({
      ok: true,
      strategy: process.env.TIKTOK_ADVERTISER_IDS
        ? "advertiser/info (token only)"
        : "oauth2/advertiser/get",
      token_preview: token
        ? `${token.slice(0, 8)}…${token.slice(-4)}`
        : "(refreshed)",
      count: advertisers.length,
      advertisers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: formatTikTokError(err) },
      { status: 502 },
    );
  }
}
