/**
 * lib/tiktok-token.ts
 * TikTok Marketing API OAuth — token storage, refresh, and the login/callback
 * exchange. Mirrors lib/facebook-token.ts's fb_token_store pattern (F02: no
 * hard-coded token, F03: proactive refresh before expiry).
 */

import axios from "axios";
import { getSupabase } from "./supabase";
import { sendAlertEmail } from "./email";

const TIKTOK_ADS_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const TIKTOK_AUTH_DIALOG = "https://business-api.tiktok.com/portal/auth";

// In-process cache so a warm instance doesn't hit the DB on every call.
let cachedToken: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
  expiry_alert_sent_at: string | null;
}

async function readTokenRow(): Promise<TokenRow | null> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("tiktok_token_store")
      .select("access_token, refresh_token, access_expires_at, refresh_expires_at, expiry_alert_sent_at")
      .eq("id", 1)
      .maybeSingle();
    return (data as TokenRow) ?? null;
  } catch {
    return null; // table missing / query failed — caller falls back to env
  }
}

/**
 * Current TikTok access token. DB (tiktok_token_store, set via the OAuth
 * login flow) takes priority; falls back to TIKTOK_ACCESS_TOKEN env for
 * setups that haven't connected via OAuth yet.
 *
 * F03: if the DB token is within 2 hours of expiring and a refresh_token is
 * on hand, refreshes it first so callers never see a stale token.
 */
export async function getTikTokAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now - cachedAt < CACHE_TTL_MS) return cachedToken;

  const row = await readTokenRow();
  if (row?.access_token) {
    const expiresAt = row.access_expires_at ? new Date(row.access_expires_at).getTime() : null;
    const soonExpiring = expiresAt !== null && expiresAt - now < 2 * 60 * 60 * 1000;
    if (soonExpiring && row.refresh_token) {
      try {
        const refreshed = await refreshTikTokAccessToken();
        cachedToken = refreshed.access_token;
        cachedAt = now;
        return cachedToken;
      } catch (err) {
        console.error("[tiktok-token] proactive refresh failed, using existing token:", err);
      }
    }
    cachedToken = row.access_token;
    cachedAt = now;
    return cachedToken;
  }

  // DB only — no env fallback. Two tokens for one integration meant the
  // stored one could be live and healthy while a stale .env value shadowed it
  // on some other deploy, and nothing said which was in play. The store is now
  // the single source: connect once at /tiktok/sync and it is filled in.
  throw new Error(
    "ยังไม่ได้เชื่อมต่อ TikTok — ไปที่ /tiktok/sync แล้วกด \"Connect TikTok Account\" (ระบบอ่าน token จาก tiktok_token_store เท่านั้น ไม่ใช้ค่าใน .env แล้ว)",
  );
}

/** Refresh token to use. DB only — see the note inside. */
async function getRefreshToken(): Promise<string | null> {
  const row = await readTokenRow();
  // DB only — no env fallback, on purpose.
  //
  // Confirmed live (2026-10-02): the Marketing API's /oauth2/access_token/
  // returns an access token with NO refresh_token and NO expiry — the stored
  // row has access_token set and both refresh_token and access_expires_at
  // null, and that access token authenticates fine. There is nothing to
  // refresh on this API, which also explains why tiktok_error_log has never
  // once recorded a 40105 (token expired).
  //
  // TIKTOK_REFRESH_TOKEN in env is an "rft."-prefixed token from TikTok's
  // other OAuth product and this endpoint rejects it outright. Falling back
  // to it meant every hourly check-token-expiry resurrected a credential that
  // cannot work and failed with `code=40002 Invalid refresh_token` forever.
  // Returning null instead makes the refresh path a clean no-op.
  return row?.refresh_token ?? null;
}

// BUG FIX: TikTok single-uses/rotates refresh_token on every exchange — the
// old refresh_token is invalid the instant a new one is issued. With
// ADVERTISER_CONCURRENCY=10 in app/api/tiktok/sync/route.ts, every parallel
// tikTokGet() call that finds the access token "soon expiring" used to call
// this function independently, all reading the *same* still-valid
// refresh_token from DB before any of them had written a new one — a
// thundering herd where only the first caller to reach TikTok actually
// succeeds and every other one gets rejected with exactly
// `code=40002 Invalid refresh_token` (confirmed live). This single-flight
// lock makes every concurrent caller within this process join the one
// in-flight refresh instead of firing a duplicate that's doomed to fail.
let refreshInFlight: Promise<{ access_token: string; expires_in?: number }> | null = null;

/**
 * Exchange the current refresh_token for a new access_token, persist it,
 * and reset the expiry-alert flag (F03).
 */
export async function refreshTikTokAccessToken(): Promise<{ access_token: string; expires_in?: number }> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function doRefresh(): Promise<{ access_token: string; expires_in?: number }> {
  const appId = process.env.TIKTOK_CLIENT_ID;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!appId || !secret) {
    throw new Error("Cannot refresh TikTok token: TIKTOK_CLIENT_ID or TIKTOK_CLIENT_SECRET is missing");
  }
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    // Not a misconfiguration and not something reconnecting fixes: the
    // Marketing API simply does not issue refresh tokens (confirmed live —
    // a successful connect stores access_token with refresh_token and
    // access_expires_at both null, and that access token keeps working).
    // Saying "connect again" here sent people round a loop that could not
    // end, since another connect returns no refresh token either.
    throw new Error(
      "TikTok ไม่ได้ออก refresh token ให้ API ชุดนี้ (access token ไม่มีวันหมดอายุ) — ไม่มีอะไรต้องต่ออายุ",
    );
  }

  const res = await axios.post(
    `${TIKTOK_ADS_BASE}/oauth2/refresh_token/`,
    { app_id: appId, secret, refresh_token: refreshToken },
    { headers: { "Content-Type": "application/json" } },
  );
  const body = res.data;
  if (body.code !== 0) {
    throw new Error(`TikTok refresh_token failed: code=${body.code} msg=${body.message}`);
  }

  const newToken: string = body.data.access_token;
  const newRefreshToken: string | undefined = body.data.refresh_token;
  const expiresIn: number | undefined = body.data.access_token_expire_in;
  const refreshExpiresIn: number | undefined = body.data.refresh_token_expire_in;

  await persistToken({
    access_token: newToken,
    refresh_token: newRefreshToken ?? refreshToken,
    expires_in: expiresIn,
    refresh_expires_in: refreshExpiresIn,
    resetAlert: true,
  });

  cachedToken = newToken;
  cachedAt = Date.now();
  return { access_token: newToken, expires_in: expiresIn };
}

async function persistToken(opts: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  advertiser_ids?: string[];
  resetAlert?: boolean;
}) {
  const sb = getSupabase();
  await sb.from("tiktok_token_store").upsert(
    {
      id: 1,
      access_token: opts.access_token,
      refresh_token: opts.refresh_token ?? null,
      access_expires_at: opts.expires_in ? new Date(Date.now() + opts.expires_in * 1000).toISOString() : null,
      refresh_expires_at: opts.refresh_expires_in
        ? new Date(Date.now() + opts.refresh_expires_in * 1000).toISOString()
        : null,
      advertiser_ids: opts.advertiser_ids ?? undefined,
      refreshed_at: new Date().toISOString(),
      ...(opts.resetAlert ? { expiry_alert_sent_at: null } : {}),
    },
    { onConflict: "id" },
  );
}

/** F04: email + flag when the refresh token has < 7 days left. Sends once per expiry window. */
export async function checkTokenExpiryAndAlert(): Promise<void> {
  const row = await readTokenRow();
  if (!row?.refresh_expires_at || row.expiry_alert_sent_at) return;

  const msLeft = new Date(row.refresh_expires_at).getTime() - Date.now();
  const daysLeft = msLeft / (1000 * 60 * 60 * 24);
  if (daysLeft > 7) return;

  await sendAlertEmail(
    `[TikTok Ads] Refresh token expiring in ${Math.max(0, Math.round(daysLeft))} day(s)`,
    `<p>TikTok Ads refresh token expires on ${row.refresh_expires_at}. Re-authenticate at /tiktok/sync before it lapses.</p>`,
  );

  const sb = getSupabase();
  await sb.from("tiktok_token_store").update({ expiry_alert_sent_at: new Date().toISOString() }).eq("id", 1);
}

// ─── OAuth login/callback (F01) ────────────────────────────────────────────

/**
 * Build the TikTok Business login dialog URL.
 *
 * `scope` is deliberately NOT sent. It used to be pinned to
 * ["ads_management", "reporting_service"], which caps the issued token at
 * exactly those two no matter what the app is approved for — so a newly
 * granted permission (TikTok Accounts, in this case) never reached the token
 * and every call to that product kept failing with "Access token is incorrect
 * or has been revoked", indistinguishable from a genuinely dead token.
 * Omitting the parameter asks for everything the app is approved for, which
 * is what we want and avoids hard-coding scope names TikTok can rename.
 *
 * The approval gate still lives on TikTok's side: this only stops us from
 * throwing away a permission that has already been granted.
 */
export function buildTikTokLoginUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    app_id: appId,
    state,
    redirect_uri: redirectUri,
  });
  return `${TIKTOK_AUTH_DIALOG}?${params.toString()}`;
}

/** Exchange the one-time auth_code from the login redirect for tokens, and persist them. */
export async function exchangeAuthCodeForToken(authCode: string): Promise<{ access_token: string; advertiser_ids: string[] }> {
  const appId = process.env.TIKTOK_CLIENT_ID;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!appId || !secret) {
    throw new Error("TIKTOK_CLIENT_ID / TIKTOK_CLIENT_SECRET ไม่ได้ตั้งค่าใน env");
  }

  const res = await axios.post(
    `${TIKTOK_ADS_BASE}/oauth2/access_token/`,
    { app_id: appId, secret, auth_code: authCode },
    { headers: { "Content-Type": "application/json" } },
  );
  const body = res.data;
  if (body.code !== 0) {
    throw new Error(`TikTok oauth2/access_token failed: code=${body.code} msg=${body.message}`);
  }

  const d = body.data;
  await persistToken({
    access_token: d.access_token,
    refresh_token: d.refresh_token, // TikTok may or may not return one — persisted as-is either way
    expires_in: d.access_token_expire_in,
    refresh_expires_in: d.refresh_token_expire_in,
    advertiser_ids: d.advertiser_ids ?? [],
    resetAlert: true,
  });

  cachedToken = d.access_token;
  cachedAt = Date.now();

  return { access_token: d.access_token, advertiser_ids: d.advertiser_ids ?? [] };
}
