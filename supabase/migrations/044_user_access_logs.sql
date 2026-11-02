-- 001 declared this table but it never reached this database, so every write
-- (login, dashboard visit, Performance Report, Slack settings) failed silently.
create table if not exists public.ads_user_access_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references public.ads_users(id) on delete cascade,
  username    text        not null,
  page        text        not null,
  ip_address  text,
  user_agent  text,
  accessed_at timestamptz not null default now()
);

create index if not exists idx_user_access_logs_accessed_at
  on public.ads_user_access_logs(accessed_at desc);
create index if not exists idx_user_access_logs_user_id
  on public.ads_user_access_logs(user_id);

-- Server-only (service_role bypasses RLS); IPs must not be readable with the anon key.
alter table public.ads_user_access_logs enable row level security;

notify pgrst, 'reload schema';
