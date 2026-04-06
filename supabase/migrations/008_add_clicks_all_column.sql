-- Migration: Add clicks_all column to store all clicks data
-- Used for accurate CPC calculation: CPC = sum(spend) / sum(clicks_all)

ALTER TABLE public.ads_rawdata 
ADD COLUMN IF NOT EXISTS clicks_all numeric default 0;

-- Also add to other related tables for consistency
ALTER TABLE public.ads_geo
ADD COLUMN IF NOT EXISTS clicks_all numeric default 0;

ALTER TABLE public.ads_demographic
ADD COLUMN IF NOT EXISTS clicks_all numeric default 0;

ALTER TABLE public.ads_device
ADD COLUMN IF NOT EXISTS clicks_all numeric default 0;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_ads_rawdata_clicks_all
  ON public.ads_rawdata(clicks_all);
