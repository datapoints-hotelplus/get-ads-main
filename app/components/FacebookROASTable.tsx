"use client";

import { useEffect, useState } from "react";

type FacebookROASData = {
  spend: number;
  purchase_value: number;
  purchases: number;
  roas: number;
};

export function FacebookROASTable({
  account,
  dateFrom,
  dateTo,
}: {
  account: string;
  dateFrom: string;
  dateTo: string;
}) {
  const [data, setData] = useState<FacebookROASData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFBData = async () => {
      if (!account || !dateFrom || !dateTo) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/facebook-roas?account=${encodeURIComponent(account)}&dateFrom=${dateFrom}&dateTo=${dateTo}`
        );
        if (!res.ok) throw new Error(`Error: ${res.status}`);
        const result = await res.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchFBData();
  }, [account, dateFrom, dateTo]);

  if (loading) return <div className="text-gray-500 p-4">กำลังดึงจาก FB API...</div>;
  if (error) return <div className="text-red-600 p-4">Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        📊 ข้อมูลจาก Facebook API ({account})
      </h3>
      <table className="w-full text-sm">
        <tbody className="divide-y">
          <tr className="hover:bg-gray-50">
            <td className="px-4 py-3 text-gray-700 font-medium">Spend</td>
            <td className="px-4 py-3 text-right font-mono">
              ฿{data.spend.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
            </td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="px-4 py-3 text-gray-700 font-medium">Revenue (Purchase Value)</td>
            <td className="px-4 py-3 text-right font-mono text-green-600 font-semibold">
              ฿{data.purchase_value.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
            </td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="px-4 py-3 text-gray-700 font-medium">Purchases</td>
            <td className="px-4 py-3 text-right font-mono">
              {data.purchases.toLocaleString()}
            </td>
          </tr>
          <tr className="bg-blue-50 hover:bg-blue-100">
            <td className="px-4 py-3 text-gray-900 font-bold">ROAS</td>
            <td className="px-4 py-3 text-right font-mono text-lg font-bold text-blue-600">
              {data.roas.toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-4">
        💡 ข้อมูลนี้ดึงจาก Facebook API โดยตรง ไม่เก็บในฐานข้อมูล
      </p>
    </div>
  );
}
