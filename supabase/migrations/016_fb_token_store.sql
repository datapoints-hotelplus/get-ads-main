-- Stores the current Facebook long-lived access token so sync endpoints
-- can auto-refresh it (exchange for a new 60-day token before expiry).
-- Single-row design: always use id=1.

create table if not exists fb_token_store (
  id            int primary key default 1,
  access_token  text not null,
  expires_at    timestamptz,
  refreshed_at  timestamptz default now(),
  constraint fb_token_store_singleton check (id = 1)
);

-- Allow service role full access; deny everyone else (token is sensitive)
alter table fb_token_store enable row level security;

create policy "service role only" on fb_token_store
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
