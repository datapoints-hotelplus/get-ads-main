import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { buildFacebookLoginUrl } from "@/lib/facebook-token";
import crypto from "crypto";

async function checkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

// GET /api/admin/facebook-login
// Redirects the admin to the Facebook Login dialog. Facebook then redirects
// back to /api/admin/facebook-callback with a one-time `code`.
export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.FB_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { error: "FB_APP_ID ไม่ได้ตั้งค่าใน env" },
      { status: 500 },
    );
  }

  const redirectUri = `${request.nextUrl.origin}/api/admin/facebook-callback`;
  const state = crypto.randomBytes(16).toString("hex");
  const loginUrl = buildFacebookLoginUrl(appId, redirectUri, state);

  const res = NextResponse.redirect(loginUrl);
  // Short-lived state cookie — checked in the callback to block CSRF.
  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300, // 5 minutes
    path: "/",
  });
  return res;
}
