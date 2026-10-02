/**
 * app/api/tiktok/status/route.ts
 * GET /api/tiktok/status
 *
 * Connection/sync status for the header bubble + banner (F05, F24, F26):
 *   - last_success_at / last_sync   – most recent successful & most recent
 *     sync attempt (used for the "ข้อมูล ณ [timestamp]" cached-data label)
 *   - connected                     – false when the last attempt failed
 *     with an auth error (401 / TikTok code 40105) → UI shows the
 *     "API Disconnected" modal and disables Sync Now (EC3/AC6)
 *   - consecutive_failures          – for the same banner's detail text
 *   - outage_minutes                – how long failures have been
 *     continuous when it's NOT an auth error, so a >30min stretch gets its
 *     own "TikTok API มีปัญหา" banner distinct from the re-auth modal
 *     (EC10/AC5)
 *   - syncing / progress            – whether a sync is running right now
 *     plus completed/total advertisers, for a progress bar and to show
 *     "Sync กำลังดำเนินการ..." instead of letting a second click race it
 *     (EC5/EC8/EC9/AC13)
 *   - status_detail                 – live one-line status from inside the
 *     running sync (rate-limit cooldown, field-error) (EC1/EC2)
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const STALE_RUNNING_MS = 6 * 60 * 1000; // mirrors app/api/tiktok/sync/route.ts's lock staleness window

export async function GET() {
  const sb = getSupabase();

  const { data: recent } = await sb
    .from("tiktok_sync_log")
    .select("status, started_at, finished_at, error_message, status_detail, total_advertisers, completed_advertisers")
    .order("started_at", { ascending: false })
    .limit(10);

  const rows = recent ?? [];
  const last = rows[0] ?? null;
  const lastSuccess = rows.find((r) => r.status === "success") ?? null;

  let consecutiveFailures = 0;
  for (const r of rows) {
    if (r.status === "fail") consecutiveFailures += 1;
    else break;
  }

  const authError =
    last?.status === "fail" &&
    /40105|401|unauthor/i.test(last.error_message ?? "");

  // EC10/AC5: minutes since the *start* of the current unbroken run of
  // non-auth failures — only meaningful when not an auth error (that case
  // gets its own modal instead, see EC3/AC6).
  let outageMinutes: number | null = null;
  if (!authError && consecutiveFailures > 0) {
    const failRun = rows.slice(0, consecutiveFailures);
    const oldestFailStart = failRun[failRun.length - 1]?.started_at;
    if (oldestFailStart) outageMinutes = Math.round((Date.now() - new Date(oldestFailStart).getTime()) / 60000);
  }

  // EC8/EC9: is a sync running right now (and not a crashed/stale row)?
  const runningRow = rows.find((r) => r.status === "running") ?? null;
  const syncing =
    !!runningRow && Date.now() - new Date(runningRow.started_at).getTime() <= STALE_RUNNING_MS;

  // F04 (in-app half): surface days left on the refresh token so the UI can
  // show a warning banner even before the daily sync's email alert fires.
  const { data: tokenRow } = await sb
    .from("tiktok_token_store")
    .select("refresh_expires_at")
    .eq("id", 1)
    .maybeSingle();
  const refreshExpiresAt = tokenRow?.refresh_expires_at ?? null;
  const refreshDaysLeft = refreshExpiresAt
    ? Math.round((new Date(refreshExpiresAt).getTime() - Date.now()) / 86400000)
    : null;

  const { data: controlRow } = await sb.from("tiktok_sync_control").select("sync_paused, pause_reason").eq("id", 1).maybeSingle();

  // EC1: no new column — the rate-limit cooldown already writes a live
  // status_detail line (see setStatusDetail's "TikTok rate limit ที่ ..."
  // in lib/tiktok-ads.ts's tikTokGet), so just detect that instead of
  // persisting a separate rate_limited flag.
  const statusDetail = syncing ? (runningRow?.status_detail ?? null) : null;
  const rateLimited = /rate limit/i.test(statusDetail ?? "");

  return NextResponse.json({
    connected: !authError,
    last_sync: last,
    last_success_at: lastSuccess?.finished_at ?? null,
    consecutive_failures: consecutiveFailures,
    outage_minutes: outageMinutes,
    refresh_expires_at: refreshExpiresAt,
    refresh_days_left: refreshDaysLeft,
    syncing,
    status_detail: statusDetail,
    rate_limited: rateLimited,
    progress: syncing
      ? { completed: runningRow?.completed_advertisers ?? 0, total: runningRow?.total_advertisers ?? null }
      : null,
    sync_paused: controlRow?.sync_paused ?? false,
    sync_paused_reason: controlRow?.sync_paused ? (controlRow?.pause_reason ?? null) : null,
  });
}
