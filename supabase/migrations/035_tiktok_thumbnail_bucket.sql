-- ============================================================
-- Supabase Migration: 035_tiktok_thumbnail_bucket.sql
-- Public storage bucket for re-hosted TikTok ad thumbnails.
--
-- Why: TikTok's own cover/thumbnail URLs (poster_url from
-- /file/video/ad/get/, thumbnail_url from the oEmbed endpoint) are signed
-- and expire ~2 days after being issued — confirmed live by decoding a
-- stored URL's x-expires param. Storing that URL as-is meant every
-- thumbnail went dead a couple days after its last sync, for every
-- viewer, not just a stale cache. lib/tiktok-ads.ts persistThumbnail()
-- downloads the image once at sync time and re-uploads it here, under a
-- permanent public URL, instead of storing TikTok's temporary one.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('tiktok-thumbnails', 'tiktok-thumbnails', true)
on conflict (id) do nothing;
