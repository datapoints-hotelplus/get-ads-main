-- Seed default KPI templates for portfolio dashboard
-- direction: lower_better = ยิ่งต่ำยิ่งดี, higher_better = ยิ่งสูงยิ่งดี
-- green_min / yellow_min: สำหรับ lower_better → green = ≤ green_min, yellow = ≤ yellow_min
--                         สำหรับ higher_better → green = ≥ green_min, yellow = ≥ yellow_min

insert into ads_portfolio_templates (name, metric, direction, target, green_min, yellow_min)
values
  -- 1. Message Campaign — cost per message (บาท)
  ('Message Campaign',      'cost_per_message',   'lower_better',  60,   60,   80),
  -- 2. Reach Campaign — CPM (บาท per 1,000 impressions)
  ('Reach Campaign',        'cpm',                'lower_better',  10,   10,   15),
  -- 3. Traffic Campaign — CPC (บาท per click)
  ('Traffic Campaign',      'cpc',                'lower_better',   5,    5,    8),
  -- 4. Lead Generation — cost per lead (บาท)
  ('Lead Generation',       'cost_per_lead',      'lower_better', 200,  200,  350),
  -- 5. Conversion — cost per purchase (บาท)
  ('Conversion',            'cost_per_purchase',  'lower_better', 500,  500,  800),
  -- 6. ROAS — return on ad spend (x)
  ('ROAS',                  'roas',               'higher_better',  3,    3,    2),
  -- 7. Total Spend — ภาพรวมงบที่ใช้ (บาท) — ไม่มี target, ดูเปรียบเทียบ
  ('Total Spend',           'spend',              'lower_better', null, null, null),
  -- 8. Reach — จำนวนคนที่เห็นโฆษณา — ยิ่งสูงยิ่งดี
  ('Reach',                 'reach',              'higher_better', null, null, null),
  -- 9. Impressions — จำนวนครั้งที่แสดงโฆษณา
  ('Impressions',           'impressions',        'higher_better', null, null, null),
  -- 10. CTR — click-through rate (%)
  ('CTR',                   'ctr',                'higher_better',   1,    1,  0.5)
on conflict do nothing;
