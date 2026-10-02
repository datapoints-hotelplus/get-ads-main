-- ============================================================
-- Supabase Migration: 034_tiktok_user_advertiser_permissions.sql
-- Per-user TikTok advertiser visibility — mirrors ads_user_page_permissions
-- (the Facebook equivalent) exactly, so a Viewer only sees the TikTok ad
-- accounts an admin has granted them, same as Facebook pages already work.
-- ============================================================

create table if not exists public.tiktok_user_advertiser_permissions (
  id             bigint generated always as identity primary key,
  user_id        uuid        not null references public.ads_users(id) on delete cascade,
  advertiser_id  text        not null references public.tiktok_advertisers(advertiser_id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique(user_id, advertiser_id)
);

alter table public.tiktok_user_advertiser_permissions disable row level security;
