"use client";

import { useState } from "react";

interface AdRow {
  account_id: string;
  account_name: string;
  campaign_name: string;
  ad_name: string;
  region: string;
  date_start: string;
  date_stop: string;
  spend: number;
  frequency: number;
  reach: number;
  impressions: number;
  inline_link_clicks: number;
  purchases: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cost_per_purchase: number;
  roas: number;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: decimals });
}

export default function Home() {
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!accountId.trim()) return;
    setLoading(true);
    setError(null);
    setAds([]);

    try {
      const res = await fetch(
        `/api/ads?accountId=${encodeURIComponent(accountId.trim())}`,
      );
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "เกิดข้อผิดพลาด");
      } else {
        setAds(json.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-screen-xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Facebook Ads Insights
        </h1>

        {/* Input */}
        <div className="flex gap-3 mb-8">
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            placeholder="Ad Account ID (เช่น 123456789 หรือ act_123456789)"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleFetch}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-semibold px-6 py-2 rounded-lg transition"
          >
            {loading ? "กำลังดึงข้อมูล..." : "ดึงข้อมูล"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {ads.length > 0 && (
          <>
            <p className="text-sm text-gray-500 mb-3">
              แสดง {ads.length} รายการ · ช่วงวันที่{" "}
              {ads[0].date_start} – {ads[0].date_stop}
            </p>
            <div className="overflow-x-auto rounded-lg shadow">
              <table className="w-full text-sm text-left bg-white">
                <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                  <tr>
                    {/* Dimensions */}
                    <th className="px-3 py-3 whitespace-nowrap">Account</th>
                    <th className="px-3 py-3 whitespace-nowrap">Campaign</th>
                    <th className="px-3 py-3 whitespace-nowrap">Ad Name</th>
                    <th className="px-3 py-3 whitespace-nowrap">Region</th>
                    {/* Performance */}
                    <th className="px-3 py-3 text-right whitespace-nowrap">Spend (฿)</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Reach</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Impressions</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Frequency</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Clicks</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Purchases</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Revenue (฿)</th>
                    {/* Calculated */}
                    <th className="px-3 py-3 text-right whitespace-nowrap">CTR (%)</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">CPC (฿)</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Cost/Purchase</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ads.map((ad, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{ad.account_name}</div>
                        <div className="text-xs text-gray-400">{ad.account_id}</div>
                      </td>
                      <td className="px-3 py-3 max-w-[180px] truncate" title={ad.campaign_name}>
                        {ad.campaign_name}
                      </td>
                      <td className="px-3 py-3 max-w-[180px] truncate" title={ad.ad_name}>
                        {ad.ad_name}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{ad.region}</td>
                      <td className="px-3 py-3 text-right">{fmt(ad.spend)}</td>
                      <td className="px-3 py-3 text-right">{fmt(ad.reach, 0)}</td>
                      <td className="px-3 py-3 text-right">{fmt(ad.impressions, 0)}</td>
                      <td className="px-3 py-3 text-right">{fmt(ad.frequency)}</td>
                      <td className="px-3 py-3 text-right">{fmt(ad.inline_link_clicks, 0)}</td>
                      <td className="px-3 py-3 text-right">{fmt(ad.purchases, 0)}</td>
                      <td className="px-3 py-3 text-right">{fmt(ad.revenue)}</td>
                      <td className="px-3 py-3 text-right">{fmt(ad.ctr)}%</td>
                      <td className="px-3 py-3 text-right">{fmt(ad.cpc)}</td>
                      <td className="px-3 py-3 text-right">
                        {ad.cost_per_purchase > 0 ? fmt(ad.cost_per_purchase) : "-"}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold ${ad.roas >= 1 ? "text-green-600" : "text-red-500"}`}>
                        {ad.roas > 0 ? `${fmt(ad.roas)}x` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !error && ads.length === 0 && (
          <p className="text-gray-400 text-sm">
            ใส่ Ad Account ID แล้วกด &ldquo;ดึงข้อมูล&rdquo; เพื่อดู Ads Insights
          </p>
        )}
      </div>
    </main>
  );
}
