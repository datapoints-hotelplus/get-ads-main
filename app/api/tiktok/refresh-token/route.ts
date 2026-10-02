/**
 * app/api/tiktok/refresh-token/route.ts
 * POST /api/tiktok/refresh-token
 *
 * แลก Refresh Token (rft.xxx) เป็น Access Token (act.xxx)
 * แสดงผล access_token ใหม่ให้ copy ไปใส่ใน .env
 */

import { NextResponse } from "next/server";
import axios, { AxiosError } from "axios";

export async function POST() {
  const appId = process.env.TIKTOK_CLIENT_ID;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  // Prefer dedicated TIKTOK_REFRESH_TOKEN; fall back to TIKTOK_ACCESS_TOKEN if it's a rft.
  const refreshToken =
    process.env.TIKTOK_REFRESH_TOKEN ||
    (process.env.TIKTOK_ACCESS_TOKEN?.startsWith("rft.")
      ? process.env.TIKTOK_ACCESS_TOKEN
      : null);

  const missing: string[] = [];
  if (!appId) missing.push("TIKTOK_CLIENT_ID");
  if (!secret) missing.push("TIKTOK_CLIENT_SECRET");
  if (!refreshToken) missing.push("TIKTOK_REFRESH_TOKEN (หรือ TIKTOK_ACCESS_TOKEN=rft.xxx)");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `ไม่พบ env: ${missing.join(", ")}` },
      { status: 500 },
    );
  }

  try {
    const res = await axios.post(
      "https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/",
      {
        app_id: appId,
        secret,
        refresh_token: refreshToken,
      },
      { headers: { "Content-Type": "application/json" } },
    );

    const body = res.data;
    if (body.code !== 0) {
      return NextResponse.json(
        { error: `TikTok error code=${body.code} msg=${body.message}` },
        { status: 502 },
      );
    }

    const data = body.data;
    return NextResponse.json({
      ok: true,
      access_token: data.access_token,
      access_token_expires_in: data.access_token_expire_in,
      new_refresh_token: data.refresh_token,
      refresh_token_expires_in: data.refresh_token_expire_in,
      advertiser_ids: data.advertiser_ids ?? [],
      instruction:
        'อัปเดต .env: TIKTOK_ACCESS_TOKEN=act.xxx และ TIKTOK_REFRESH_TOKEN=new_refresh_token (ระบบจะ auto-refresh ครั้งต่อไปเมื่อ token หมดอายุ)',
    });
  } catch (err) {
    if (err instanceof AxiosError) {
      const d = err.response?.data;
      return NextResponse.json(
        {
          error: `HTTP ${err.response?.status} code=${d?.code} msg=${d?.message}`,
          raw: d,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
