-- ============================================================
-- Supabase Migration: 026_tiktok_business_snapshot.sql
-- F15: Profile Metrics — daily snapshot of TikTok Business Account stats
-- (followers/likes/videos as of that sync). "New Followers" and
-- "Engagement Rate" are derived from day-over-day deltas on top of this.
--
-- NOTE (see /api/tiktok/sync-profile): the fetch behind this table hits
-- TikTok's Business Account API, a different product surface from the
-- Marketing/Ads API the rest of this integration uses, and hasn't been
-- verified against a live account — see that route's comment before relying
-- on it.
-- ============================================================

create table if not exists public.tiktok_business_snapshot (
  id               bigint generated always as identity primary key,
  advertiser_id    text        not null,
  business_id      text,
  snapshot_date    date        not null,
  followers_count  numeric     not null default 0,
  likes_count      numeric     not null default 0,
  videos_count     numeric     not null default 0,
  created_at       timestamptz not null default now(),

  constraint tiktok_business_snapshot_unique unique (advertiser_id, snapshot_date)
);

alter table public.tiktok_business_snapshot disable row level security;
