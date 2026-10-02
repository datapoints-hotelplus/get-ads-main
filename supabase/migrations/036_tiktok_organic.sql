-- ============================================================
-- Supabase Migration: 036_tiktok_organic.sql
-- Post/account TOTALS from TikTok's Business Account API, so the dashboard
-- can show paid vs organic side by side the way TikTok Business Suite does.
--
-- ── THE ONE THING TO UNDERSTAND BEFORE EDITING THIS FILE ──────────────
-- These tables store TOTALS (paid + organic combined), NOT organic.
-- TikTok's /business/video/list/ documents video_views as "a total metric,
-- encompassing both organic and paid activities" — there is no organic-only
-- field. Organic is DERIVED at read time:
--
--     organic = total (this table) − paid (tiktok_ads_rawdata)
--               joined on tiktok_ad_creatives.tiktok_item_id = item_id
--
-- That join key already exists (see 030_tiktok_spark_ad_link.sql): Spark Ads
-- boost a real TikTok post, and tiktok_item_id is that post's id.
--
-- Storing a pre-computed "organic" column instead was the first design and
-- was wrong: it silently goes stale the moment ads data for the same post is
-- re-synced or backfilled, and nothing would flag the drift.
--
-- ── WHY SEPARATE TABLES, NOT COLUMNS ON tiktok_ads_rawdata ────────────
--   1. Different level: ads rows are per-ad-per-day; these are per-post
--      (lifetime) and per-account-per-day.
--   2. Permissions: dashboard/route.ts filters rows by advertiser_id against
--      tiktok_user_advertiser_permissions. These rows have no advertiser_id
--      (one business account is shared by all 4 advertisers — confirmed live
--      via /bc/asset/get/), so a faked one would either hide data from
--      entitled users or leak it to everyone.
--   3. Every existing read path (dashboard ×2, export/csv, export/pdf) does a
--      bare select-and-sum with no column that could exclude these rows.
-- Separate tables mean those read paths need zero changes.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. tiktok_business_accounts
--    TikTok business accounts we can pull post/account stats for.
--    Discovered automatically via /bc/get/ + /bc/asset/get/
--    (asset_type=MANAGED_BUSINESS_ACCOUNT) — no hard-coded
--    TIKTOK_BUSINESS_ID env needed. Mirrors tiktok_advertisers.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_business_accounts (
  business_id    text        primary key,
  bc_id          text,
  username       text,
  display_name   text,
  profile_image  text,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. tiktok_account_totals_daily — account level, ONE ROW PER DAY.
--    Compare against a day's summed ads totals for the same account.
--    Values are paid + organic combined (see header).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_account_totals_daily (
  id               bigint generated always as identity primary key,
  business_id      text        not null,
  stat_time_day    date        not null,
  video_views      numeric     not null default 0,
  profile_views    numeric     not null default 0,
  reach            numeric     not null default 0,
  likes            numeric     not null default 0,
  comments         numeric     not null default 0,
  shares           numeric     not null default 0,
  followers_count  numeric     not null default 0,  -- snapshot: do NOT sum
  new_followers    numeric     not null default 0,  -- daily delta: summable
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint tiktok_account_totals_daily_unique unique (business_id, stat_time_day)
);

create index if not exists idx_tiktok_account_totals_daily_day
  on public.tiktok_account_totals_daily (stat_time_day desc);

-- ─────────────────────────────────────────────────────────────
-- 3. tiktok_post_totals — per-post LIFETIME totals.
--
--    ⚠ Cumulative-since-post, NOT daily. There is deliberately no
--    stat_time_day column: /business/video/list/ only reports a post's
--    running total, so storing it per-day and summing a date range would
--    multiply every view count by the number of days in that range. Rows are
--    overwritten in place each sync; fetched_at says how fresh they are.
--    Never SUM these across a date filter.
--
--    item_id joins to tiktok_ad_creatives.tiktok_item_id to get the paid
--    half, which is what makes the paid-vs-organic split possible.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_post_totals (
  id                       bigint generated always as identity primary key,
  business_id              text        not null,
  item_id                  text        not null,
  caption                  text,
  thumbnail_url            text,
  share_url                text,
  create_time              timestamptz,
  video_duration           numeric,
  video_views              numeric     not null default 0,
  reach                    numeric     not null default 0,
  likes                    numeric     not null default 0,
  comments                 numeric     not null default 0,
  shares                   numeric     not null default 0,
  full_video_watched_rate  numeric,
  average_time_watched     numeric,
  total_time_watched       numeric,
  -- Where views came from (For You / Follow / Search / ...) as TikTok returns
  -- it. Kept as jsonb rather than normalised into columns — one chart reads
  -- it, and TikTok's own docs note it goes missing on posts inactive >7 days.
  impression_sources       jsonb,
  fetched_at               timestamptz not null default now(),

  constraint tiktok_post_totals_unique unique (business_id, item_id)
);

create index if not exists idx_tiktok_post_totals_views
  on public.tiktok_post_totals (video_views desc);

create index if not exists idx_tiktok_post_totals_item
  on public.tiktok_post_totals (item_id);

-- Service role bypasses RLS; matches every other tiktok_* table here.
alter table public.tiktok_business_accounts     disable row level security;
alter table public.tiktok_account_totals_daily  disable row level security;
alter table public.tiktok_post_totals           disable row level security;
