import { useEffect, useState, useCallback } from "react";

export type FacebookAdRow = {
  date_start: string;
  campaign_name: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  inline_link_clicks: number;
  reach: number;
  purchases: number;
  purchase_value: number;
  roas: number;
  cpm: number;
};

type CacheEntry = {
  rows: FacebookAdRow[];
  timestamp: number;
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

function getCacheKey(account: string, dateFrom: string, dateTo: string): string {
  return `${account}|${dateFrom}|${dateTo}`;
}

export function useFacebookAds(
  account: string,
  dateFrom: string,
  dateTo: string
) {
  const [rows, setRows] = useState<FacebookAdRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!account || !dateFrom || !dateTo) {
        setRows([]);
        return;
      }

      const cacheKey = getCacheKey(account, dateFrom, dateTo);
      const cached = cache.get(cacheKey);

      // ถ้ามี cache และไม่ expired และ ไม่ force refresh → ใช้ cache
      if (
        !forceRefresh &&
        cached &&
        Date.now() - cached.timestamp < CACHE_DURATION
      ) {
        setRows(cached.rows);
        setLastUpdated(new Date(cached.timestamp));
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/facebook-ads?account=${encodeURIComponent(account)}&dateFrom=${dateFrom}&dateTo=${dateTo}`
        );
        if (!res.ok) throw new Error(`Error: ${res.status}`);
        const data = await res.json();
        const newRows = data.rows || [];

        // บันทึก cache
        const now = Date.now();
        cache.set(cacheKey, { rows: newRows, timestamp: now });
        setRows(newRows);
        setLastUpdated(new Date(now));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        // ถ้า error แต่มี old cache → ใช้ old cache
        if (cached) {
          setRows(cached.rows);
          setLastUpdated(new Date(cached.timestamp));
        } else {
          setRows([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [account, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  return { rows, loading, error, lastUpdated, refresh: () => fetchData(true) };
}
