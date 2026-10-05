/**
 * app/api/tiktok/sync-windsor/route.ts
 * POST /api/tiktok/sync-windsor
 *
 * Pulls TikTok organic data through Windsor.ai and writes it into the same
 * two tables /api/tiktok/sync-account-totals writes to. Windsor holds the
 * TikTok Accounts API approval we are still waiting on; this route exists so
 * the dashboard has organic numbers in the meantime.
 *
 * The tables are the interface between the two sources — nothing downstream
 * knows or cares which route filled them, so switching over once TikTok
 * approves our own app is a matter of changing which cron runs. There is
 * deliberately no provider abstraction for two implementations.
 *
 * ⚠ business_id is ALWAYS TikTok's own id (TIKTOK_BUSINESS_ID), never the
 * account_id Windsor returns. Windsor's is an app-scoped open_id
 * ("_000ISlq...") — TikTok issues a different one to every app, so Dataslayer
 * returns a different string again for this same account. Writing Windsor's
 * id would key its rows differently from the TikTok route's rows and split
 * one account into two series that never join up.
 *
 * Query params: ?date_preset=last_90d (default; last_120d and above are
 * rejected by Windsor, see the DATE_PRESET note below).
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 300;

const WINDSOR_BASE = "https://connectors.windsor.ai/tiktok_organic";

// Confirmed live against the connector: last_1d / last_7d / last_30d /
// last_60d / last_90d all return data; last_120d, last_180d, last_365d and
// "maximum" all return HTTP 400, as do date_from/date_to and
// start_date/end_date. 90 days is as far back as one call reaches — which
// only matters for the first run, since every run after that is topping up
// a table that keeps everything.
const DEFAULT_DATE_PRESET = "last_90d";
const ALLOWED_DATE_PRESETS = ["last_1d", "last_7d", "last_30d", "last_60d", "last_90d"];

// Account-level fields, copied verbatim from a request confirmed to work.
//
// Windsor 400s the whole request if it dislikes the field list, and it is
// the COMBINATION that matters, not just the names: `date, profile_views,
// account_name` works and `date, profile_views, total_followers_count,
// account_name` is rejected, while this longer list containing all of them
// is accepted. `datasource`, `source` and `username` appear to be carrying
// that combination, so don't trim them for looking redundant.
//
// (`followers` and `follower_count` are rejected outright — the follower
// total is `total_followers_count`.)
const ACCOUNT_FIELDS = [
  "date",
  "datasource",
  "account_name",
  "source",
  "username",
  "profile_views",
  "total_followers_count",
  // Confirmed live against Overview.csv (TikTok Studio export) — exact
  // match day for day, e.g. 2026-08-13: 17003 both places. NOT
  // video_views_count, which returns HTTP 200 in this same combination but
  // wrong values (a handful of views on a day Studio reports 17003) — a 200
  // only means Windsor accepted the field list, not that the numbers are
  // right, and this field name was checked against a source of truth before
  // being trusted.
  "video_views",
];

// Proven to work on its own, and enough to keep profile views flowing if the
// list above ever stops being accepted. Losing follower counts is much
// better than losing the whole account sync.
const ACCOUNT_MINIMAL_FIELDS = ["date", "profile_views", "account_name"];

// Video-level. The first five are confirmed; the rest come from the
// connector's own field list and are dropped as a group if Windsor rejects
// them, rather than failing the sync (same all-or-nothing trap the TikTok
// reporting API has).
const VIDEO_CORE_FIELDS = [
  "video_id",
  "video_caption",
  "video_create_datetime",
  "video_views_count",
  "video_likes",
];
const VIDEO_BONUS_FIELDS = [
  "video_reach",
  "video_comments",
  "video_shares",
  "video_favorites",
  "video_profile_views",
  "video_new_followers",
  "video_duration",
  "video_thumbnail_url",
  "video_share_url",
  "video_full_watched_rate",
  "video_average_time_watched",
  "video_total_time_watched",
];

type WindsorRow = Record<string, unknown>;

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}

/** null rather than 0 for absent values — a missing metric is not a zero one. */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

async function windsorGet(apiKey: string, datePreset: string, fields: string[]): Promise<WindsorRow[]> {
  const url = `${WINDSOR_BASE}?date_preset=${encodeURIComponent(datePreset)}&fields=${encodeURIComponent(fields.join(","))}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  // Read the body even on failure — Windsor's error responses carry a real
  // reason ("TikTok Organic provides data only for the last 60 days..."),
  // and that text is what tells apart a rejected field list from a date
  // range that simply doesn't fit. Confusing the two once already meant a
  // 60-day-window error triggered the fields fallback, dropping
  // total_followers_count and video_views for no reason related to them.
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // The key is in the query string, so the URL — never the body, which is
    // safe — must never reach a log.
    const reason = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new Error(`Windsor rejected [${fields.join(", ")}] at ${datePreset}: ${reason}`);
  }
  return Array.isArray(body?.data) ? (body.data as WindsorRow[]) : [];
}

// Windsor enforces this cap on richer account-level field combinations (it
// does not apply to the 3-field minimal combo, which reaches back 90 days —
// confirmed live: same account, same day, ACCOUNT_MINIMAL_FIELDS succeeds at
// last_90d while ACCOUNT_FIELDS fails with this exact message). Detected by
// text because Windsor reports it as a 400 with no distinct error code.
const SIXTY_DAY_CAP_MARKER = "last 60 days";

export async function POST(req: Request) {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "WINDSOR_API_KEY not set" }, { status: 501 });
  }
  const businessId = process.env.TIKTOK_BUSINESS_ID;
  if (!businessId) {
    return NextResponse.json(
      { error: "TIKTOK_BUSINESS_ID not set — rows must be keyed by TikTok's own account id, not Windsor's (see this route's file comment)" },
      { status: 501 },
    );
  }

  const requested = new URL(req.url).searchParams.get("date_preset");
  const datePreset = requested && ALLOWED_DATE_PRESETS.includes(requested) ? requested : DEFAULT_DATE_PRESET;

  const sb = getSupabase();
  const result: {
    date_preset: string;
    account_rows: number;
    post_rows: number;
    dropped_account_fields: string[];
    dropped_video_fields: string[];
    // true when the account-level fetch had to fall back to a 60-day window
    // because Windsor rejected the requested one for this field combination
    // — the post-level sync and its date_preset above are unaffected.
    account_date_capped: boolean;
    errors: string[];
  } = {
    date_preset: datePreset,
    account_rows: 0,
    post_rows: 0,
    dropped_account_fields: [],
    dropped_video_fields: [],
    account_date_capped: false,
    errors: [],
  };

  // ── Account level, one row per day ───────────────────────────────────────
  try {
    let rows: WindsorRow[];
    try {
      rows = await windsorGet(apiKey, datePreset, ACCOUNT_FIELDS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes(SIXTY_DAY_CAP_MARKER) && datePreset !== "last_60d") {
        // The fields are fine — the requested window is just longer than
        // Windsor allows for them. Retrying the SAME fields at 60 days keeps
        // followers_count and video_views; dropping them here would have
        // thrown away real, working data over a date-range mismatch that has
        // nothing to do with which fields were asked for.
        try {
          rows = await windsorGet(apiKey, "last_60d", ACCOUNT_FIELDS);
          result.account_date_capped = true;
        } catch {
          result.dropped_account_fields = ["total_followers_count", "video_views"];
          rows = await windsorGet(apiKey, datePreset, ACCOUNT_MINIMAL_FIELDS);
        }
      } else {
        // A genuine field rejection (or the 60-day retry itself failed) —
        // Windsor rejects the WHOLE request over one bad field, so this
        // fallback loses everything past the minimal set at once, both
        // total_followers_count and video_views, not just one of them.
        result.dropped_account_fields = ["total_followers_count", "video_views"];
        rows = await windsorGet(apiKey, datePreset, ACCOUNT_MINIMAL_FIELDS);
      }
    }

    const haveFollowers = result.dropped_account_fields.length === 0;

    const days = rows
      .map((r) => ({
        day: String(r.date ?? "").slice(0, 10),
        profile_views: num(r.profile_views),
        followers: num(r.total_followers_count),
        // Only present on the ACCOUNT_FIELDS path, same as followers.
        video_views: num(r.video_views),
      }))
      .filter((r) => r.day)
      // A follower total of 0 is not a real figure for an account that has
      // any followers at all — it means the day is still filling in, which
      // Windsor does for the most recent date. Keeping such a row would also
      // hand the next day a delta of minus the entire follower base.
      // Skipped entirely on the fallback path, where every row reads 0
      // because the field wasn't requested — filtering there would throw the
      // whole account sync away to avoid a problem that isn't present.
      .filter((r) => !haveFollowers || r.followers > 0)
      .sort((a, b) => a.day.localeCompare(b.day));

    // Fields only present on the ACCOUNT_FIELDS path are added via a
    // conditional spread rather than set to `undefined` on the base object.
    // Both are supposed to make Supabase's upsert omit the column and leave
    // a previous run's value in place — but omitting the key structurally,
    // before the object exists in any serialized form, is a guarantee; a key
    // present with an undefined value is a promise about how upsert() and
    // postgrest-js handle it, and that promise broke once already: adding
    // video_views this way sent an explicit NULL to Postgres and hit its
    // NOT NULL constraint.
    const payload = days.map((d, i) => ({
      business_id: businessId,
      stat_time_day: d.day,
      profile_views: d.profile_views,
      ...(haveFollowers
        ? {
            video_views: d.video_views,
            followers_count: d.followers,
            // Day-over-day delta, signed — negative days are real (people
            // unfollow) and summing a range gives the true net change. The
            // first day in the window has no predecessor to diff against and
            // gets 0, since followers_count is a running total: treating it
            // as its own delta would report the whole follower base as
            // gained that day.
            new_followers: i > 0 ? d.followers - days[i - 1].followers : 0,
          }
        : {}),
      updated_at: new Date().toISOString(),
    }));

    if (payload.length > 0) {
      const { error } = await sb
        .from("tiktok_account_totals_daily")
        .upsert(payload, { onConflict: "business_id,stat_time_day" });
      if (error) throw new Error(error.message);
      result.account_rows = payload.length;
    }
  } catch (err) {
    result.errors.push(`account: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Video level, one row per post, LIFETIME totals ───────────────────────
  // Not per-day: Windsor returns each video once, with its running total
  // since it was published, and `date` is the post's create date rather than
  // a metric date. Confirmed live — 30 videos came back for last_90d, each
  // video_id appearing exactly once. Rows are overwritten in place each run;
  // never SUM these across a date filter.
  try {
    let fields = [...VIDEO_CORE_FIELDS, ...VIDEO_BONUS_FIELDS];
    let rows: WindsorRow[];
    try {
      rows = await windsorGet(apiKey, datePreset, fields);
    } catch {
      // Windsor 400s the whole request over one bad field name, and there is
      // no way to tell which — fall back to the set confirmed to work.
      result.dropped_video_fields = VIDEO_BONUS_FIELDS;
      fields = [...VIDEO_CORE_FIELDS];
      rows = await windsorGet(apiKey, datePreset, fields);
    }

    // One post can be boosted by several ads, but Windsor returns it once —
    // deduped anyway so a repeat could never become two conflicting rows.
    const byItem = new Map<string, WindsorRow>();
    for (const r of rows) {
      const itemId = String(r.video_id ?? "");
      if (itemId) byItem.set(itemId, r);
    }

    const payload = [...byItem.entries()].map(([itemId, r]) => ({
      business_id: businessId,
      item_id: itemId,
      caption: (r.video_caption as string) || null,
      thumbnail_url: (r.video_thumbnail_url as string) || null,
      share_url: (r.video_share_url as string) || null,
      create_time: (r.video_create_datetime as string) || null,
      video_duration: numOrNull(r.video_duration),
      video_views: num(r.video_views_count),
      reach: num(r.video_reach),
      likes: num(r.video_likes),
      comments: num(r.video_comments),
      shares: num(r.video_shares),
      favorites: num(r.video_favorites),
      profile_views: num(r.video_profile_views),
      new_followers: num(r.video_new_followers),
      full_video_watched_rate: numOrNull(r.video_full_watched_rate),
      average_time_watched: numOrNull(r.video_average_time_watched),
      total_time_watched: numOrNull(r.video_total_time_watched),
      fetched_at: new Date().toISOString(),
    }));

    if (payload.length > 0) {
      const { error } = await sb
        .from("tiktok_post_totals")
        .upsert(payload, { onConflict: "business_id,item_id" });
      if (error) throw new Error(error.message);
      result.post_rows = payload.length;
    }
  } catch (err) {
    result.errors.push(`video: ${err instanceof Error ? err.message : String(err)}`);
  }

  const ok = result.account_rows > 0 || result.post_rows > 0;
  return NextResponse.json({ success: ok, ...result }, { status: ok ? 200 : 502 });
}
