-- Migration: Add missing columns to ads_geo, ads_demographic, ads_device
-- Purpose: Align schema with sync API that inserts date_stop, inline_link_clicks, purchases, purchase_value

ALTER TABLE public.ads_geo
ADD COLUMN IF NOT EXISTS date_stop date;

ALTER TABLE public.ads_geo
ADD COLUMN IF NOT EXISTS inline_link_clicks numeric default 0;

ALTER TABLE public.ads_geo
ADD COLUMN IF NOT EXISTS purchases numeric default 0;

ALTER TABLE public.ads_geo
ADD COLUMN IF NOT EXISTS purchase_value numeric default 0;

ALTER TABLE public.ads_demographic
ADD COLUMN IF NOT EXISTS date_stop date;

ALTER TABLE public.ads_demographic
ADD COLUMN IF NOT EXISTS inline_link_clicks numeric default 0;

ALTER TABLE public.ads_demographic
ADD COLUMN IF NOT EXISTS purchases numeric default 0;

ALTER TABLE public.ads_demographic
ADD COLUMN IF NOT EXISTS purchase_value numeric default 0;

ALTER TABLE public.ads_device
ADD COLUMN IF NOT EXISTS date_stop date;

ALTER TABLE public.ads_device
ADD COLUMN IF NOT EXISTS inline_link_clicks numeric default 0;

ALTER TABLE public.ads_device
ADD COLUMN IF NOT EXISTS purchases numeric default 0;

ALTER TABLE public.ads_device
ADD COLUMN IF NOT EXISTS purchase_value numeric default 0;
