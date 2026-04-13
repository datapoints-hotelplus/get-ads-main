-- Migration: Add ad_name column to ads_geo, ads_demographic, ads_device
-- Purpose: Store the Facebook ad name for better reporting and debugging

ALTER TABLE public.ads_geo
ADD COLUMN IF NOT EXISTS ad_name text;

ALTER TABLE public.ads_demographic
ADD COLUMN IF NOT EXISTS ad_name text;

ALTER TABLE public.ads_device
ADD COLUMN IF NOT EXISTS ad_name text;
