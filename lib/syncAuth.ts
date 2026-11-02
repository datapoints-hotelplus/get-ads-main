/**
 * lib/syncAuth.ts
 * Authorizes calls to sync-trigger endpoints (e.g. app/api/tiktok/sync).
 *
 * Two ways in, either is enough:
 *  1. Logged-in admin session cookie (the "Sync Now" button in the UI)
 *  2. Shared secret header — for external triggers (n8n, cron, curl):
 *       Authorization: Bearer <SYNC_TRIGGER_SECRET>
 *
 * Set SYNC_TRIGGER_SECRET in the environment to enable #2.
 */

import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/sessionToken";

/** True only for the shared-secret caller (n8n, cron), not an admin session. */
export function isSyncBearer(req: Request): boolean {
  const secret = process.env.SYNC_TRIGGER_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function isAuthorizedSyncCaller(req: Request): Promise<boolean> {
  if (isSyncBearer(req)) return true;

  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}
