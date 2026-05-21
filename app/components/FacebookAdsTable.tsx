"use client";

import { useFacebookAds, type FacebookAdRow } from "../hooks/useFacebookAds";
import AdHeatmapTable from "./AdHeatmapTable";

type Props = {
  account: string;
  dateFrom: string;
  dateTo: string;
  hideSpend?: boolean;
};

export default function FacebookAdsTable({
  account,
  dateFrom,
  dateTo,
  hideSpend = false,
}: Props) {
  const { rows, loading, error, lastUpdated, refresh } = useFacebookAds(
    account,
    dateFrom,
    dateTo
  );

  if (!account || !dateFrom || !dateTo) {
    return null;
  }

  const formatTime = (date: Date | null) => {
    if (!date) return "—";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes === 0) return "เพิ่งแล้ว";
    if (minutes === 1) return "1 นาทีที่แล้ว";
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div data-aos="fade-up" data-aos-delay="150">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-700">
            📊 ตาราง Ad (จาก Facebook API)
          </h2>
          {loading && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
              <span className="w-2 h-2 bg-amber-600 rounded-full animate-pulse"></span>
              กำลังอัปเดต...
            </span>
          )}
          {lastUpdated && !loading && (
            <span className="text-xs text-gray-500">
              {formatTime(lastUpdated)}
            </span>
          )}
        </div>
        <button
          onClick={() => refresh()}
          disabled={loading}
          className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {rows.length > 0 ? (
        <AdHeatmapTable rows={rows} hasFbData={true} hideSpend={hideSpend} />
      ) : loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="inline-block animate-spin">⏳</div>
          <p className="mt-2">กำลังดึงข้อมูลจาก Facebook...</p>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          ไม่พบข้อมูล Ad
        </div>
      )}

      <div className="text-xs text-gray-500 mt-3">
        💡 Cache: 5 นาที | จำนวน: {rows.length} ads
      </div>
    </div>
  );
}
