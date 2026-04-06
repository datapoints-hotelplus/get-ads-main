-- Migration: Remove duplicate records from ads_rawdata
-- This removes duplicate rows for the same (account_name, ad_id, date_start) combination
-- Keeping only the most recent record (by created_at)

DO $$ 
DECLARE
    v_deleted_count INT = 0;
BEGIN
    -- Create temporary table with duplicates and their row IDs to keep
    CREATE TEMP TABLE duplicate_rows AS
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY account_name, ad_id, date_start 
            ORDER BY created_at DESC
        ) as rn
    FROM ads_rawdata;
    
    -- Delete duplicate rows (keeping rn=1, which is the most recent)
    DELETE FROM ads_rawdata 
    WHERE id IN (
        SELECT id FROM duplicate_rows WHERE rn > 1
    );
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % duplicate rows from ads_rawdata', v_deleted_count;
END $$;

-- Also clean up other tables
DO $$ 
DECLARE
    v_deleted_count INT = 0;
BEGIN
    CREATE TEMP TABLE duplicate_geo AS
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY ad_id, date_start, region
            ORDER BY created_at DESC NULLS LAST
        ) as rn
    FROM ads_geo;
    
    DELETE FROM ads_geo 
    WHERE id IN (
        SELECT id FROM duplicate_geo WHERE rn > 1
    );
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % duplicate rows from ads_geo', v_deleted_count;
END $$;

DO $$ 
DECLARE
    v_deleted_count INT = 0;
BEGIN
    CREATE TEMP TABLE duplicate_demographic AS
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY ad_id, date_start, age, gender
            ORDER BY created_at DESC NULLS LAST
        ) as rn
    FROM ads_demographic;
    
    DELETE FROM ads_demographic 
    WHERE id IN (
        SELECT id FROM duplicate_demographic WHERE rn > 1
    );
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % duplicate rows from ads_demographic', v_deleted_count;
END $$;

DO $$ 
DECLARE
    v_deleted_count INT = 0;
BEGIN
    CREATE TEMP TABLE duplicate_device AS
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY ad_id, date_start, impression_device
            ORDER BY created_at DESC NULLS LAST
        ) as rn
    FROM ads_device;
    
    DELETE FROM ads_device 
    WHERE id IN (
        SELECT id FROM duplicate_device WHERE rn > 1
    );
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % duplicate rows from ads_device', v_deleted_count;
END $$;
