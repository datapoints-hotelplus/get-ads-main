"use client";

import { useState } from "react";

interface Totals {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cost_per_purchase: number;
}

interface CampaignRow {
  campaign_name: string;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  ctr: number;
}

interface RegionRow {
  region: string;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

interface SummaryData {
  account_id: string;
  account_name: string;
  date_start: string;
  date_stop: string;
  totals: Totals;
  by_campaign: CampaignRow[];
  by_region: RegionRow[];
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: decimals });
}

function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "red";
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-1 hover:shadow-md transition-shadow border border-gray-100">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
        {label}
      </p>
      <p
        className={`text-2xl font-bold ${
          highlight === "green"
            ? "text-green-600"
            : highlight === "red"
              ? "text-red-500"
              : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function SummaryPage() {
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!accountId.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(
        `/api/ads-summary?accountId=${encodeURIComponent(accountId.trim())}`,
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "เกิดข้อผิดพลาด");
      } else {
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className=" min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6" data-aos="fade-down">
          <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
            <svg
              className="w-5 h-5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ads Summary</h1>
        </div>

        {/* Input */}
        <div
          className="flex gap-3 mb-8"
          data-aos="fade-up"
          data-aos-delay="100"
        >
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            placeholder="Ad Account ID (เช่น 123456789 หรือ act_123456789)"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
          />
          <button
            onClick={handleFetch}
            disabled={loading}
            className="bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition shadow-sm hover:shadow-md"
          >
            {loading ? "กำลังโหลด..." : "ดูสรุป"}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Header info */}
            <div className="mb-6" data-aos="fade-up">
              <p className="text-lg font-semibold text-gray-800">
                {data.account_name}
              </p>
              <p className="text-sm text-gray-500">
                Account ID: {data.account_id} · {data.date_start} –{" "}
                {data.date_stop}
              </p>
            </div>

            {/* KPI Cards */}
            <div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8"
              data-aos="fade-up"
              data-aos-delay="100"
            >
              <KpiCard label="Spend" value={`฿${fmt(data.totals.spend)}`} />
              <KpiCard label="Revenue" value={`฿${fmt(data.totals.revenue)}`} />
              <KpiCard
                label="ROAS"
                value={`${fmt(data.totals.roas)}x`}
                highlight={data.totals.roas >= 1 ? "green" : "red"}
              />
              <KpiCard
                label="Purchases"
                value={fmt(data.totals.purchases, 0)}
                sub={`Cost/Purchase ฿${fmt(data.totals.cost_per_purchase)}`}
              />
              <KpiCard
                label="Reach"
                value={fmt(data.totals.reach, 0)}
                sub={`Impressions ${fmt(data.totals.impressions, 0)}`}
              />
              <KpiCard label="Clicks" value={fmt(data.totals.clicks, 0)} />
              <KpiCard label="CTR" value={`${fmt(data.totals.ctr)}%`} />
              <KpiCard label="CPC" value={`฿${fmt(data.totals.cpc)}`} />
              <KpiCard label="Frequency" value="—" sub="Average per person" />
            </div>

            {/* By Campaign */}
            <div className="mb-8" data-aos="fade-up" data-aos-delay="200">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                แยกตาม Campaign
              </h2>
              <div className="overflow-x-auto rounded-xl shadow">
                <table className="w-full text-sm text-left bg-white">
                  <thead className="bg-secondary text-gray-100 uppercase text-xs">
                    <tr>
                      <th className="px-3 py-3">Campaign</th>
                      <th className="px-3 py-3 text-right">Spend (฿)</th>
                      <th className="px-3 py-3 text-right">Reach</th>
                      <th className="px-3 py-3 text-right">Impressions</th>
                      <th className="px-3 py-3 text-right">Clicks</th>
                      <th className="px-3 py-3 text-right">CTR (%)</th>
                      <th className="px-3 py-3 text-right">Purchases</th>
                      <th className="px-3 py-3 text-right">Revenue (฿)</th>
                      <th className="px-3 py-3 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.by_campaign.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td
                          className="px-3 py-3 max-w-xs truncate"
                          title={row.campaign_name}
                        >
                          {row.campaign_name}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.spend)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.reach, 0)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.impressions, 0)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.clicks, 0)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.ctr)}%
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.purchases, 0)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.revenue)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-semibold ${
                            row.roas >= 1 ? "text-green-600" : "text-red-500"
                          }`}
                        >
                          {row.roas > 0 ? `${fmt(row.roas)}x` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By Region */}
            <div data-aos="fade-up" data-aos-delay="300">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                Top 10 จังหวัด (by Spend)
              </h2>
              <div className="overflow-x-auto rounded-xl shadow">
                <table className="w-full text-sm text-left bg-white">
                  <thead className="bg-secondary text-gray-100 uppercase text-xs">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">จังหวัด</th>
                      <th className="px-3 py-3 text-right">Spend (฿)</th>
                      <th className="px-3 py-3 text-right">Reach</th>
                      <th className="px-3 py-3 text-right">Impressions</th>
                      <th className="px-3 py-3 text-right">Clicks</th>
                      <th className="px-3 py-3 text-right">Purchases</th>
                      <th className="px-3 py-3 text-right">Revenue (฿)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.by_region.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-3 font-medium">{row.region}</td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.spend)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.reach, 0)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.impressions, 0)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.clicks, 0)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.purchases, 0)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {fmt(row.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!loading && !error && !data && (
          <p className="text-gray-400 text-sm">
            ใส่ Ad Account ID แล้วกด &ldquo;ดูสรุป&rdquo; เพื่อดู Ads Summary
          </p>
        )}
      </div>
    </main>
  );
}
