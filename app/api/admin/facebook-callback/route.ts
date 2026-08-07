import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { getSupabase } from "@/lib/supabase";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
} from "@/lib/facebook-token";

async function checkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

function redirectToConfig(origin: string, params: Record<string, string>) {
  const url = new URL("/admin/config", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

// GET /api/admin/facebook-callback?code=...&state=...
// Facebook redirects here after login. Exchanges the code for a token,
// upgrades it to a 60-day long-lived token, and saves it to Supabase.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const fbError = searchParams.get("error_description") || searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("fb_oauth_state")?.value;

  if (fbError) {
    return redirectToConfig(origin, { fb_login_error: fbError });
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToConfig(origin, {
      fb_login_error: "Invalid or expired login request (state mismatch)",
    });
  }

  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  if (!appId || !appSecret) {
    return redirectToConfig(origin, {
      fb_login_error: "FB_APP_ID หรือ FB_APP_SECRET ไม่ได้ตั้งค่าใน env",
    });
  }

  try {
    const redirectUri = `${origin}/api/admin/facebook-callback`;
    const shortLived = await exchangeCodeForToken(
      code,
      appId,
      appSecret,
      redirectUri,
    );
    const longLived = await exchangeForLongLivedToken(
      shortLived.access_token,
      appId,
      appSecret,
    );

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    const supabase = getSupabase();
    const { error: dbErr } = await supabase.from("fb_token_store").upsert(
      {
        id: 1,
        access_token: longLived.access_token,
        expires_at: expiresAt,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (dbErr) {
      return redirectToConfig(origin, { fb_login_error: dbErr.message });
    }

    const res = redirectToConfig(origin, { fb_login_success: "1" });
    res.cookies.delete("fb_oauth_state");
    return res;
  } catch (e: any) {
    const fbMsg =
      e?.response?.data?.error?.message ?? e?.message ?? "Unknown error";
    return redirectToConfig(origin, { fb_login_error: fbMsg });
  }
}
