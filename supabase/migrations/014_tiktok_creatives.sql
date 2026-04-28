-- ============================================================
-- Supabase Migration: 014_tiktok_creatives.sql
-- Stores TikTok ad creative info (video thumbnail URL)
-- ============================================================

create table if not exists public.tiktok_ad_creatives (
  ad_id           text        primary key,
  advertiser_id   text        not null,
  video_id        text,
  video_cover_url text,
  updated_at      timestamptz not null default now()
);

alter table public.tiktok_ad_creatives disable row level security;

create index if not exists idx_tiktok_ad_creatives_advertiser
  on public.tiktok_ad_creatives (advertiser_id);
