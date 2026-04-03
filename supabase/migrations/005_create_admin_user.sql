-- Create admin user (password: admin123!)
-- Run this AFTER migration 004_user_role.sql
INSERT INTO public.ads_users (username, password_hash, display_name, role, is_active)
VALUES (
  'admin',
  '5d534611cb71e05a19b1944ffd560e74:614dbbca469481955e2db6fc012d6c67e3c448689e3410950a790e0ff40936b30db50b10ad81dc83091b2eda98c6f181bfbc7aafd095e17c12db85d7d03a37af',
  'Administrator',
  'admin',
  true
)
ON CONFLICT (username) DO UPDATE SET
  role = 'admin',
  password_hash = EXCLUDED.password_hash;
