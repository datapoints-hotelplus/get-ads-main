/**
 * app/api/tiktok/refresh-token/route.ts
 * POST /api/tiktok/refresh-token
 *
 * Manual "refresh now" for the Settings page. Delegates to
 * refreshTikTokAccessToken() so it behaves exactly like the automatic
 * refresh: reads the refresh token from tiktok_token_store (falling back to
 * env), and writes the rotated pair straight back to the store.
 *
 * It used to call TikTok directly and hand the new tokens to the operator to
 * paste into .env. That bricked the integration: TikTok single-uses and
 * rotates refresh_token on every exchange (see the BUG FIX note in
 * lib/tiktok-token.ts), so the moment this ran, the refresh token in .env was
 * dead. Copy the access token but miss the new refresh token — easy, they
 * were two fields on a results panel — and every later refresh failed with
 * `code=40002 Invalid refresh_token`, permanently, with no way back except
 * re-authorising from scratch. Nothing should produce a credential that only
 * exists on screen.
 */

import { NextResponse } from "next/server";
import { refreshTikTokAccessToken } from "@/lib/tiktok-token";

export async function POST() {
  try {
    const { access_token } = await refreshTikTokAccessToken();
    return NextResponse.json({
      ok: true,
      // Enough to confirm it worked; the value itself is already saved and
      // deliberately not echoed in full.
      access_token_preview: `${access_token.slice(0, 6)}…${access_token.slice(-4)}`,
      message: "ต่ออายุสำเร็จ — บันทึกลง tiktok_token_store แล้ว ไม่ต้องแก้ .env",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 40002 here means the stored refresh token is spent or revoked, and no
    // amount of retrying fixes it — say what actually resolves it.
    const needsReconnect = /40002|invalid refresh_token|No TikTok refresh_token/i.test(msg);
    return NextResponse.json(
      {
        error: msg,
        ...(needsReconnect
          ? { hint: 'Refresh token ใช้ไม่ได้แล้ว — กด "Connect TikTok Account" ด้านบนเพื่อเชื่อมต่อใหม่' }
          : {}),
      },
      { status: 502 },
    );
  }
}
