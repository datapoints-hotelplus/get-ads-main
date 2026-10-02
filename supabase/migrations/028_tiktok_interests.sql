-- ============================================================
-- Supabase Migration: 028_tiktok_interests.sql
-- F13/doc "Interest Alignment" — audience interest category breakdown.
--
-- ⚠ UNVERIFIED like tiktok_business_snapshot (026): the fetch behind this
-- table (lib/tiktok-ads.ts fetchAudienceInterests) guesses at an
-- "interest_category" dimension on the AUDIENCE report — TikTok's public
-- Marketing API docs don't clearly confirm this is queryable the way
-- gender/age are. If the real endpoint rejects it, sync just logs the
-- error and this table stays empty — it will never break the rest of sync.
-- ============================================================

create table if not exists public.tiktok_audience_interests (
  id              bigint generated always as identity primary key,
  advertiser_id   text        not null,
  stat_time_day   date        not null,
  interest_category text      not null,
  reach           numeric     not null default 0,
  impressions     numeric     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tiktok_audience_interests_unique unique (advertiser_id, stat_time_day, interest_category)
);

alter table public.tiktok_audience_interests disable row level security;
