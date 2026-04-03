-- Add is_active column to ads_allpage if it doesn't exist
ALTER TABLE public.ads_allpage
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
