/**
 * app/api/tiktok/callback/route.ts
 * GET /api/tiktok/callback?auth_code=...&state=...
 *
 * TikTok redirects here after the login dialog. Exchanges auth_code for an
 * access token, saves it to tiktok_token_store, and kicks off the first
 * sync in the background. Mirrors /api/admin/facebook-callback.
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse, after } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { exchangeAuthCodeForToken } from "@/lib/tiktok-token";

export const maxDuration = 300; // first sync can take a while — see /api/tiktok/sync

async function checkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

function redirectToSync(origin: string, params: Record<string, string>) {
  const url = new URL("/tiktok/sync", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const authCode = searchParams.get("auth_code");
  const state = searchParams.get("state");
  const tiktokError = searchParams.get("error_description") || searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("tiktok_oauth_state")?.value;

  if (tiktokError) {
    return redirectToSync(origin, { tiktok_login_error: tiktokError });
  }
  if (!authCode || !state || !expectedState || state !== expectedState) {
    return redirectToSync(origin, {
      tiktok_login_error: "Invalid or expired login request (state mismatch)",
    });
  }

  try {
    await exchangeAuthCodeForToken(authCode);

    // Kick off the first sync in the background — don't block the redirect.
    // Needs SYNC_TRIGGER_SECRET set (see lib/syncAuth.ts); otherwise the
    // admin just clicks "Sync Data" on the page they land on.
    const secret = process.env.SYNC_TRIGGER_SECRET;
    if (secret) {
      after(async () => {
        try {
          const syncRes = await fetch(`${origin}/api/tiktok/sync?source=manual`, {
            method: "POST",
            headers: { Authorization: `Bearer ${secret}` },
          });
          console.log("[tiktok/callback] first sync:", await syncRes.json().catch(() => null));
        } catch (e) {
          console.error("[tiktok/callback] first sync failed:", e);
        }
      });
    }

    const res = redirectToSync(origin, {
      tiktok_login_success: "1",
      sync_started: secret ? "1" : "0",
    });
    res.cookies.delete("tiktok_oauth_state");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return redirectToSync(origin, { tiktok_login_error: msg });
  }
}
