/**
 * app/api/tiktok/check-token-expiry/route.ts
 * POST /api/tiktok/check-token-expiry
 *
 * AC3: "Admin ได้รับ email + in-app alert ภายใน 1 ชั่วโมง" ของการที่ refresh
 * token เหลือน้อย — F04's checkTokenExpiryAndAlert() used to only run as a
 * side effect of a successful /api/tiktok/sync, so the alert's timing rode
 * on however often ads sync happens to run, not a real hourly check. This
 * is the same function, exposed on its own so it can be scheduled hourly
 * independent of the (24h) ads sync — see docs/N8N_CRON_ENDPOINTS.md.
 *
 * F03/AC2: also calls getTikTokAccessToken() — its proactive-refresh check
 * (access token within 2h of expiring → refresh) previously only ran as a
 * side effect of whichever fetch* call happened to go first inside a full
 * sync. Hitting it here too means the access token gets refreshed on this
 * same hourly cadence even if the 24h ads sync hasn't run yet.
 */

import { NextResponse } from "next/server";
import { checkTokenExpiryAndAlert, getTikTokAccessToken } from "@/lib/tiktok-token";

export async function POST() {
  await getTikTokAccessToken();
  await checkTokenExpiryAndAlert();
  return NextResponse.json({ success: true });
}
