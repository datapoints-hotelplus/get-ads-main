/**
 * app/api/tiktok/login/route.ts
 * GET /api/tiktok/login
 *
 * F01: real OAuth 2.0 flow. Redirects the admin to the TikTok Business
 * login dialog; TikTok then redirects back to /api/tiktok/callback with a
 * one-time `auth_code`. Mirrors /api/admin/facebook-login.
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { buildTikTokLoginUrl } from "@/lib/tiktok-token";
import crypto from "crypto";

async function checkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.TIKTOK_CLIENT_ID;
  if (!appId) {
    return NextResponse.json({ error: "TIKTOK_CLIENT_ID ไม่ได้ตั้งค่าใน env" }, { status: 500 });
  }

  const redirectUri = `${request.nextUrl.origin}/api/tiktok/callback`;
  const state = crypto.randomBytes(16).toString("hex");
  const loginUrl = buildTikTokLoginUrl(appId, redirectUri, state);

  const res = NextResponse.redirect(loginUrl);
  res.cookies.set("tiktok_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300, // 5 minutes
    path: "/",
  });
  return res;
}
