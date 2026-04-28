-- ============================================================
-- Supabase Migration: 013_tiktok_rls.sql
-- Disable RLS on TikTok tables (server-side writes only,
-- matching the pattern used for all other tables in this project).
-- ============================================================

alter table public.tiktok_advertisers disable row level security;
alter table public.tiktok_ads_rawdata  disable row level security;
