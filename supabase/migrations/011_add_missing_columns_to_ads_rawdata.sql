-- Migration: Add missing columns to ads_rawdata for video engagement and cost metrics
-- Purpose: Support new KPI metrics from sync API

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS objective text;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS ctr_all numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS roas numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS cost_per_result numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS video_views_3s numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS video_p25 numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS video_p50 numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS video_p75 numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS video_p100 numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS video_avg_time numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS hook_rate numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS hold_rate numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS post_comments numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS post_reactions numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS post_engagement numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS cost_per_engagement numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS cost_per_like numeric default 0;

ALTER TABLE public.ads_rawdata
ADD COLUMN IF NOT EXISTS cost_per_message numeric default 0;
