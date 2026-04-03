-- Add role column to ads_users
ALTER TABLE public.ads_users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Set existing admin user (if username = 'admin') to admin role
UPDATE public.ads_users SET role = 'admin' WHERE username = 'admin';
