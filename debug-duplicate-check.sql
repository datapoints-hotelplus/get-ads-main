-- ตรวจสอบข้อมูลซ้ำสำหรับวันที่ 2026-02-01 กับ campaign "Marcom - Mahachai Grand View"

-- 1. นับจำนวนแถวทั้งหมด
SELECT COUNT(*) as total_rows,
       COUNT(DISTINCT ad_id) as distinct_ads,
       SUM(impressions) as total_impressions,
       SUM(spend) as total_spend
FROM ads_rawdata
WHERE date_start = '2026-02-01'
AND campaign_name = 'Marcom - Mahachai Grand View';

-- 2. หาแถวที่ซ้ำ (duplicate ad_id ในวันเดียวกัน)
SELECT ad_id, ad_name, campaign_name, date_start,
       COUNT(*) as row_count,
       SUM(impressions) as impressions_sum,
       SUM(spend) as spend_sum
FROM ads_rawdata
WHERE date_start = '2026-02-01'
AND campaign_name = 'Marcom - Mahachai Grand View'
GROUP BY ad_id, ad_name, campaign_name, date_start
HAVING COUNT(*) > 1
ORDER BY row_count DESC;

-- 3. CPM calculation check
SELECT 
    date_start,
    campaign_name,
    SUM(spend) as total_spend,
    SUM(impressions) as total_impressions,
    CASE 
        WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000
        ELSE 0
    END as calculated_cpm
FROM ads_rawdata
WHERE date_start = '2026-02-01'
AND campaign_name = 'Marcom - Mahachai Grand View'
GROUP BY date_start, campaign_name;

-- 4. ดูแต่ละแถว (แยกตามแต่ละ ad)
SELECT ad_id, ad_name, impressions, spend,
       CASE 
           WHEN impressions > 0 THEN (spend / impressions) * 1000
           ELSE 0
       END as ad_cpm,
       created_at
FROM ads_rawdata
WHERE date_start = '2026-02-01'
AND campaign_name = 'Marcom - Mahachai Grand View'
ORDER BY ad_id, created_at;
