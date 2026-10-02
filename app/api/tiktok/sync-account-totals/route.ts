/**
 * app/api/tiktok/sync-account-totals/route.ts
 * POST /api/tiktok/sync-account-totals
 *
 * Account-level daily totals — Profile Views and New Followers, plus the
 * engagement numbers that come free in the same response — into
 * tiktok_account_totals_daily (defined in 036_tiktok_organic.sql; that
 * migration's other two tables are for the paid-vs-organic split and are not
 * needed by this route).
 *
 * This supersedes /api/tiktok/sync-profile (F15), which needed a hand-set
 * TIKTOK_BUSINESS_ID, could only snapshot followers/likes/videos, and had no
 * profile-views figure at all. Business accounts are discovered here instead
 * of configured. sync-profile is left in place until this one has run against
 * a live account.
 *
 * ⚠ Needs TikTok's *Accounts API* permission on the app — a different product
 * surface from the Marketing/Ads API every other route here uses. See the
 * "Accounts API" section header in lib/tiktok-ads.ts. Until that permission is
 * granted and the connection re-authorized, this returns 502 with TikTok's own
 * error rather than writing zeros that would look like real flat data.
 *
 * Query params: ?lookback_days=N (default 30; TikTok keeps profile-level
 * metrics for a limited window, so this is not a backfill tool).
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAuthorizedSyncCaller } from "@/lib/syncAuth";
import {
  fetchBusinessAccounts,
  fetchAccountDailyMetrics,
  getLastDiscoveryRaw,
  chunkDateRange,
  formatTikTokError,
  type TikTokAccountDayStat,
  type TikTokBusinessAccount,
} from "@/lib/tiktok-ads";

export const maxDuration = 300;

const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_LOOKBACK_DAYS = 365;
const CHUNK_DAYS = 30;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  if (!(await isAuthorizedSyncCaller(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lookbackParam = Number(new URL(req.url).searchParams.get("lookback_days"));
  const lookbackDays =
    Number.isFinite(lookbackParam) && lookbackParam > 0 && lookbackParam <= MAX_LOOKBACK_DAYS
      ? Math.floor(lookbackParam)
      : DEFAULT_LOOKBACK_DAYS;

  const sb = getSupabase();

  // ── Step 1: discover business accounts ───────────────────────────────────
  let accounts: TikTokBusinessAccount[];
  try {
    accounts = await fetchBusinessAccounts();
  } catch (err) {
    return NextResponse.json({ error: `Business account discovery failed: ${formatTikTokError(err)}` }, { status: 502 });
  }
  if (accounts.length === 0) {
    return NextResponse.json(
      { error: "No business accounts found — check that the Accounts API permission is granted to this app and the connection re-authorized (see this route's file comment). Raw API responses are in tiktok_error_log." },
      { status: 502 },
    );
  }

  // ── Step 2: pull daily metrics per account ───────────────────────────────
  // Profile-level metrics lag 24-48h, so today is never complete — end on
  // yesterday. One extra day is fetched before the window purely as the
  // baseline that the first real day's follower delta is measured against;
  // it's dropped before writing.
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - lookbackDays);
  const baseline = new Date(start);
  baseline.setDate(baseline.getDate() - 1);

  const endStr = isoDay(end);
  const startStr = isoDay(start);
  const chunks = chunkDateRange(isoDay(baseline), endStr, CHUNK_DAYS);

  // `data` carries the days themselves, not just a count, and `raw` carries
  // TikTok's untouched response. Storing is a separate, non-fatal step below:
  // the first question this route has to answer is whether TikTok returns
  // these numbers at all, and that answer must survive a missing table.
  const results: {
    business_id: string;
    rows: number;
    stored: boolean;
    data: unknown[];
    dropped_fields?: string[];
    store_error?: string;
    error?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw?: any;
  }[] = [];

  for (const account of accounts) {
    try {
      const chunkResults = await Promise.all(
        chunks.map((c) => fetchAccountDailyMetrics(account.business_id, c.start, c.end)),
      );

      // Deduped by date — chunkDateRange doesn't overlap, but a boundary day
      // echoed twice by TikTok would otherwise become two conflicting rows.
      const byDate = new Map<string, TikTokAccountDayStat>();
      for (const { rows } of chunkResults) for (const r of rows) byDate.set(r.stat_time_day, r);
      const days = [...byDate.values()].sort((a, b) => a.stat_time_day.localeCompare(b.stat_time_day));

      const droppedFields = [...new Set(chunkResults.flatMap((r) => r.droppedFields))];

      const payload = days
        .map((day, i) => {
          const previous = i > 0 ? days[i - 1] : null;
          return {
            business_id: account.business_id,
            stat_time_day: day.stat_time_day,
            video_views: day.video_views,
            profile_views: day.profile_views,
            reach: day.reach,
            likes: day.likes,
            comments: day.comments,
            shares: day.shares,
            followers_count: day.followers_count,
            // Day-over-day delta. Negative when the account lost followers
            // that day — that's real, not an error, and stays signed so a
            // summed range still nets out to the true change.
            // Left at 0 (not guessed) when the previous day is missing,
            // since followers_count itself is a running total: treating the
            // first day's total as its own delta would report the entire
            // follower base as "gained today".
            new_followers: previous ? day.followers_count - previous.followers_count : 0,
            updated_at: new Date().toISOString(),
          };
        })
        // Drop the baseline day — it was fetched only to diff against.
        .filter((r) => r.stat_time_day >= startStr);

      // Storing is best-effort and deliberately NOT fatal: the table it wants
      // (tiktok_account_totals_daily, from 036_tiktok_organic.sql) may not
      // exist yet. Failing the whole call over that would throw away the
      // fetched numbers, which are the point.
      let storeError: string | undefined;
      if (payload.length > 0) {
        const { error } = await sb
          .from("tiktok_account_totals_daily")
          .upsert(payload, { onConflict: "business_id,stat_time_day" });
        if (error) storeError = error.message;
      }

      results.push({
        business_id: account.business_id,
        rows: payload.length,
        stored: payload.length > 0 && !storeError,
        data: payload,
        ...(droppedFields.length > 0 ? { dropped_fields: droppedFields } : {}),
        ...(storeError ? { store_error: storeError } : {}),
        // Only when nothing parsed — otherwise this doubles the response size
        // for no reason.
        ...(payload.length === 0 ? { raw: chunkResults.map((r) => r.raw) } : {}),
      });
    } catch (err) {
      const message = formatTikTokError(err);
      console.error(`[tiktok/sync-account-totals] ${account.business_id}:`, message);
      results.push({ business_id: account.business_id, rows: 0, stored: false, data: [], error: message });
    }
  }

  // "Success" here means TikTok answered with data — not that it was stored.
  const anyFetched = results.some((r) => r.rows > 0);
  return NextResponse.json(
    {
      success: anyFetched,
      since: startStr,
      until: endStr,
      accounts_found: accounts.length,
      accounts: results,
      // Only when nothing came back: the id we send as business_id is picked
      // out of whichever field discovery found, and sending the wrong one
      // makes TikTok answer with an auth error rather than "unknown account".
      // These rows say which field is the right one.
      ...(results.every((r) => r.rows === 0) ? { discovered_assets: getLastDiscoveryRaw() } : {}),
    },
    { status: anyFetched ? 200 : 502 },
  );
}
