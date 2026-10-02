-- ============================================================
-- Supabase Migration: 030_tiktok_spark_ad_link.sql
-- Most ads in this account are Spark Ads (boosted existing TikTok posts —
-- identity_type "TT_USER", no video_id). They can't get a thumbnail image
-- via /file/video/ad/get/ (that's for directly-uploaded video creatives
-- only), but tiktok_item_id lets the UI link straight to the real video
-- via TikTok's oEmbed embed URL instead.
-- ============================================================

alter table public.tiktok_ad_creatives
  add column if not exists tiktok_item_id text;
