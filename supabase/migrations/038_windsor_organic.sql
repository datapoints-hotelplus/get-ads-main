-- ============================================================
-- Supabase Migration: 038_windsor_organic.sql
-- The two tables the organic sync writes to.
--
-- 036_tiktok_organic.sql defined these first but was never applied, and it
-- also created tiktok_business_accounts, which nothing uses any more. This
-- migration creates only what is needed and adds the columns Windsor returns
-- that 036 did not anticipate — written with IF NOT EXISTS throughout so it
-- is safe whether or not 036 was ever run.
--
-- Both /api/tiktok/sync-windsor and /api/tiktok/sync-account-totals write
-- here. The tables ARE the interface between those two sources: nothing
-- downstream knows which one filled a row, so switching from Windsor to
-- TikTok's own Accounts API once it is approved means changing which cron
-- runs, and nothing else. There is deliberately no `source` column — the
-- numbers are the same TikTok data either way, so a later run simply
-- overwrites an earlier one.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. tiktok_account_totals_daily — account level, ONE ROW PER DAY
--
--    business_id is ALWAYS TikTok's own numeric id, never the account id
--    Windsor returns. Windsor's ("_000ISlq...") is an app-scoped open_id:
--    TikTok issues a different one to every app, so Dataslayer returns a
--    different string again for this same account. Keying rows by it would
--    split one account into two series that never join up.
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
  followers_count  numeric     not null default 0,  -- running total: do NOT sum
  new_followers    numeric     not null default 0,  -- signed daily delta: summable
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint tiktok_account_totals_daily_unique unique (business_id, stat_time_day)
);

create index if not exists idx_tiktok_account_totals_daily_day
  on public.tiktok_account_totals_daily (stat_time_day desc);

-- ─────────────────────────────────────────────────────────────
-- 2. tiktok_post_totals — per-post LIFETIME totals
--
--    ⚠ Cumulative since the post was published, NOT daily. There is
--    deliberately no stat_time_day column: the source reports only a running
--    total per post, so storing it per-day and summing a date range would
--    multiply every view count by the number of days in that range. Rows are
--    overwritten in place each sync; fetched_at says how fresh they are.
--    Never SUM these across a date filter.
--
--    item_id joins to tiktok_ad_creatives.tiktok_item_id to get the paid
--    half. One post is often boosted by several ads (item
--    7537281223924747527 runs under three ad_ids), so that join must
--    aggregate rather than assume one row each.
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
  favorites                numeric     not null default 0,
  profile_views            numeric     not null default 0,
  new_followers            numeric     not null default 0,
  full_video_watched_rate  numeric,
  average_time_watched     numeric,
  total_time_watched       numeric,
  fetched_at               timestamptz not null default now(),

  constraint tiktok_post_totals_unique unique (business_id, item_id)
);

-- Columns 036 did not have, for the case where 036 was already applied.
alter table public.tiktok_post_totals add column if not exists favorites     numeric not null default 0;
alter table public.tiktok_post_totals add column if not exists profile_views numeric not null default 0;
alter table public.tiktok_post_totals add column if not exists new_followers numeric not null default 0;

create index if not exists idx_tiktok_post_totals_views
  on public.tiktok_post_totals (video_views desc);

create index if not exists idx_tiktok_post_totals_item
  on public.tiktok_post_totals (item_id);

-- Service role bypasses RLS; matches every other tiktok_* table here.
alter table public.tiktok_account_totals_daily disable row level security;
alter table public.tiktok_post_totals          disable row level security;
