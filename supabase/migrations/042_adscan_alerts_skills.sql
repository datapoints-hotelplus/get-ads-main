-- ADSCAN persistent alerts + AI Skill masterdata.

-- One row per alert episode: opens the first day a campaign is over threshold,
-- stays open (last_seen moves forward, times_seen counts days) until a day the
-- engine no longer flags it — then closed_at/close_reason are set. A later
-- relapse opens a new episode. Feeds "ค้างมา N วัน / แจ้งครั้งที่ N" and the
-- Performance Report.
create table if not exists public.adscan_alerts (
  id            bigint generated always as identity primary key,
  campaign_id   text        not null,
  account_id    text        not null,             -- act_…
  metric        text        not null,             -- template metric, e.g. cost_per_message
  first_seen    date        not null,             -- data date the episode started
  last_seen     date        not null,
  times_seen    int         not null default 1,   -- days flagged = "แจ้งครั้งที่ N"
  sev           text        not null,             -- latest severity
  value         numeric,                          -- latest value (null = spent with no result)
  closed_at     date,                             -- data date it stopped being flagged
  close_reason  text check (close_reason in ('improved', 'stopped')),
  created_at    timestamptz not null default now()
);
create index if not exists idx_adscan_alerts_open on public.adscan_alerts(campaign_id) where closed_at is null;
create index if not exists idx_adscan_alerts_account on public.adscan_alerts(account_id, first_seen desc);

-- Which data dates have been scanned, so each day is applied once.
create table if not exists public.adscan_scans (
  data_date   date        primary key,
  scanned_at  timestamptz not null default now()
);

-- AI Skill: every save is a new version (old ones are kept = change history).
-- The newest active row is the one in use.
create table if not exists public.adscan_skills (
  version     int generated always as identity primary key,
  model       text        not null,
  prompt      text        not null,
  note        text,
  is_active   boolean     not null default true,
  created_by  uuid        references public.ads_users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One recommendation per campaign per data date per skill version — opening
-- the page again doesn't call the AI again.
create table if not exists public.adscan_ai_cache (
  campaign_id    text        not null,
  data_date      date        not null,
  skill_version  int         not null references public.adscan_skills(version) on delete cascade,
  text           text        not null,
  created_at     timestamptz not null default now(),
  primary key (campaign_id, data_date, skill_version)
);

alter table public.adscan_alerts   disable row level security;
alter table public.adscan_scans    disable row level security;
alter table public.adscan_skills   disable row level security;
alter table public.adscan_ai_cache disable row level security;

insert into public.adscan_skills (model, prompt, note)
select 'gemini-2.5-flash', $prompt$คุณคือผู้เชี่ยวชาญ Facebook/Meta Ads ของทีม Marcom ที่ดูแลโฆษณาให้โรงแรม
คุณจะได้รับข้อมูล alert ของ Campaign หนึ่งเป็น JSON: ตัวชี้วัดที่ตรวจ เกณฑ์ ตัวเลข 7 วันล่าสุด ค่ารายวัน 30 วัน และตัวเลขแยกราย Ad Set / Ad

ตอบเป็นภาษาไทย สั้น กระชับ สำหรับคนที่จะเข้าไปแก้ใน Ads Manager ทันที:
1. สรุปปัญหา 1 ประโยค อ้างตัวเลขจริง
2. สาเหตุที่น่าจะเป็น 1–2 ข้อ อ้างอิง Ad Set / Ad ตามชื่อจริง
3. สิ่งที่ต้องทำ เรียงตามลำดับ ไม่เกิน 3 ข้อ แต่ละข้อบอกว่าแก้ที่ไหน (ชื่อ Ad Set / Ad) และแก้อย่างไร
4. ผลที่คาดว่าจะได้ ถ้าคำนวณได้จากข้อมูล

ห้ามแต่งตัวเลขที่ไม่มีในข้อมูล ถ้าข้อมูลไม่พอให้บอกตรง ๆ
ถ้าเป็นข่าวดี ให้แนะนำว่าควรเพิ่มงบที่ไหนแทน$prompt$, 'เวอร์ชันเริ่มต้น'
where not exists (select 1 from public.adscan_skills);
