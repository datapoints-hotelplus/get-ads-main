import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * Append one row to ads_user_access_logs for the signed-in caller (x-user-id
 * is set by proxy.ts). `page` names what happened, e.g. "adscan_slack_test".
 * The IP is x-forwarded-for's first hop — trustworthy behind Vercel/the host
 * proxy, spoofable if the app is ever reached directly.
 */
export async function logAccess(req: NextRequest, page: string): Promise<void> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return;
  const sb = getSupabase();
  const { data: me } = await sb.from("ads_users").select("username").eq("id", userId).maybeSingle();
  const { error } = await sb.from("ads_user_access_logs").insert({
    user_id: userId, username: me?.username ?? "?", page,
    ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null,
    user_agent: req.headers.get("user-agent"),
  });
  // A logging failure must not block the action, but it must not vanish either.
  if (error) console.error(`access log "${page}" not written: ${error.message}`);
}
