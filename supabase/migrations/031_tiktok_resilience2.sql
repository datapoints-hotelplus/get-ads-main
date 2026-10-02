-- ============================================================
-- Supabase Migration: 031_tiktok_resilience2.sql
-- Second resilience pass — concurrent-sync lock support, sync
-- progress, error categorization, per-metric permission tracking,
-- storage-throttle switch.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. tiktok_sync_log — progress (EC5/AC13) + live status text
--    (EC1/EC2/EC9). The "running" row itself doubles as the
--    concurrent-sync lock (EC8) — no separate lock table needed.
-- ─────────────────────────────────────────────────────────────
alter table public.tiktok_sync_log
  add column if not exists total_advertisers     integer,
  add column if not exists completed_advertisers integer not null default 0,
  add column if not exists status_detail         text;

-- ─────────────────────────────────────────────────────────────
-- 2. tiktok_error_log — category so the status endpoint can pick
--    the right banner text (rate_limit / field_error /
--    permission_denied / null = generic) (EC1/EC2/EC4)
-- ─────────────────────────────────────────────────────────────
alter table public.tiktok_error_log
  add column if not exists error_category text;

-- ─────────────────────────────────────────────────────────────
-- 3. tiktok_metric_permissions — which report metrics TikTok is
--    rejecting with permission_denied per advertiser, so the
--    dashboard can say *why* a KPI is blank instead of just
--    failing the whole sync (EC4). Repopulated fully on every
--    sync (delete+insert per advertiser) so a metric that gets
--    un-blocked later disappears on its own — no manual cleanup.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_metric_permissions (
  advertiser_id text        not null,
  metric        text        not null,
  detected_at   timestamptz not null default now(),
  primary key (advertiser_id, metric)
);
alter table public.tiktok_metric_permissions disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 4. tiktok_sync_control — single-row switch to pause sync when
--    storage looks exhausted (EC12). No admin action deletes data
--    automatically; this only stops new syncs until an admin (or
--    freed-up storage) clears it.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_sync_control (
  id           bigint primary key default 1,
  sync_paused  boolean     not null default false,
  pause_reason text,
  updated_at   timestamptz not null default now(),
  constraint tiktok_sync_control_singleton check (id = 1)
);
alter table public.tiktok_sync_control disable row level security;
