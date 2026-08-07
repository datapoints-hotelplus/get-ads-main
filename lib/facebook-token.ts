import axios, { AxiosError } from "axios";
import { getSupabase } from "./supabase";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

// In-process cache so a refreshed token is reused within the same warm instance.
let cachedToken: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // re-read from DB every minute

interface FBError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

/**
 * Returns the current Facebook access token.
 * Reads from Supabase first (latest refreshed), falls back to FB_ACCESS_TOKEN env.
 */
export async function getFacebookAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now - cachedAt < CACHE_TTL_MS) return cachedToken;

  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("fb_token_store")
      .select("access_token")
      .eq("id", 1)
      .single();
    if (data?.access_token) {
      cachedToken = data.access_token as string;
      cachedAt = now;
      return cachedToken;
    }
  } catch {
    // Table missing or query failed — fall through to env.
  }

  const envToken = process.env.FB_ACCESS_TOKEN ?? "";
  cachedToken = envToken;
  cachedAt = now;
  return envToken;
}

/**
 * Exchange the current token for a new long-lived one (60 days).
 * Persists the new token to Supabase.
 * Requires FB_APP_ID and FB_APP_SECRET to be set.
 *
 * Throws if the current token is already too expired to exchange.
 */
export async function refreshFacebookToken(): Promise<{
  access_token: string;
  expires_in?: number;
}> {
  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      "Cannot refresh Facebook token: FB_APP_ID or FB_APP_SECRET is missing",
    );
  }

  const currentToken = await getFacebookAccessToken();

  const res = await axios.get(`${FB_GRAPH_API}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: currentToken,
    },
    timeout: 15_000,
  });

  const newToken = res.data.access_token as string | undefined;
  const expiresIn = res.data.expires_in as number | undefined;
  if (!newToken) {
    throw new Error("Facebook did not return a new access_token");
  }

  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  // Persist to DB (upsert id=1)
  try {
    const supabase = getSupabase();
    await supabase.from("fb_token_store").upsert(
      {
        id: 1,
        access_token: newToken,
        expires_at: expiresAt,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch (e) {
    console.error("[fb-token] Failed to persist refreshed token:", e);
  }

  cachedToken = newToken;
  cachedAt = Date.now();

  return { access_token: newToken, expires_in: expiresIn };
}

const FB_OAUTH_DIALOG = "https://www.facebook.com/v25.0/dialog/oauth";
const FB_LOGIN_SCOPES = ["ads_read", "business_management"];

/**
 * Build the Facebook Login dialog URL. User logs in there, Facebook then
 * redirects back to `redirectUri` with a one-time `code` query param.
 */
export function buildFacebookLoginUrl(
  appId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: FB_LOGIN_SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `${FB_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchange the one-time `code` from the Login dialog redirect for a
 * short-lived user access token.
 */
export async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
): Promise<{ access_token: string; expires_in?: number }> {
  const res = await axios.get(`${FB_GRAPH_API}/oauth/access_token`, {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    },
    timeout: 15_000,
  });
  const access_token = res.data.access_token as string | undefined;
  if (!access_token) {
    throw new Error("Facebook did not return an access_token for this code");
  }
  return { access_token, expires_in: res.data.expires_in };
}

/**
 * Exchange any user access token (e.g. the short-lived one from the Login
 * dialog code exchange) for a long-lived (60 day) token.
 */
export async function exchangeForLongLivedToken(
  token: string,
  appId: string,
  appSecret: string,
): Promise<{ access_token: string; expires_in?: number }> {
  const res = await axios.get(`${FB_GRAPH_API}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: token,
    },
    timeout: 15_000,
  });
  const access_token = res.data.access_token as string | undefined;
  if (!access_token) {
    throw new Error("Facebook did not return a long-lived access_token");
  }
  return { access_token, expires_in: res.data.expires_in };
}

/**
 * Detect if an axios error is caused by an expired/invalid Facebook token.
 * Facebook returns OAuthException with code 190 when the token is bad.
 */
export function isFacebookAuthError(err: unknown): boolean {
  const e = err as AxiosError<{ error?: FBError }>;
  const fbError = e?.response?.data?.error;
  if (!fbError) return false;
  return (
    fbError.code === 190 ||
    fbError.code === 102 ||
    fbError.type === "OAuthException"
  );
}

/**
 * Run a Facebook API call. If it fails with an auth error (code 190),
 * try to refresh the token once, then retry the call with the new token.
 *
 * @param fn Receives the current token; should perform one HTTP request.
 */
export async function withFacebookTokenRefresh<T>(
  fn: (token: string) => Promise<T>,
): Promise<T> {
  let token = await getFacebookAccessToken();
  try {
    return await fn(token);
  } catch (err) {
    if (!isFacebookAuthError(err)) throw err;
    console.warn(
      "[fb-token] Detected expired/invalid token, attempting refresh…",
    );
    try {
      const refreshed = await refreshFacebookToken();
      token = refreshed.access_token;
    } catch (refreshErr) {
      console.error("[fb-token] Refresh failed:", refreshErr);
      throw err; // surface original error
    }
    return await fn(token);
  }
}
