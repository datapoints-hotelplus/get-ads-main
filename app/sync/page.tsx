"use client";

import { useState } from "react";

type AccountRow = { account_name: string; account_id: string };
type AllPageResult = {
  success: boolean;
  count: number;
  accounts: AccountRow[];
};
type BackfillResult = {
  success: boolean;
  since: string;
  until: string;
  accounts: {
    name: string;
    id: string;
    rows: Record<string, number>;
    error?: string;
  }[];
};
type DailyResult = {
  success: boolean;
  date: string;
  cutoff: string;
  accounts: {
    name: string;
    id: string;
    rows: Record<string, number>;
    error?: string;
  }[];
};

export default function SyncPage() {
  const [allPaging, setAllPaging] = useState(false);
  const [allPageResult, setAllPageResult] = useState<AllPageResult | null>(
    null,
  );
  const [allPageError, setAllPageError] = useState<string | null>(null);

  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(
    null,
  );
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const [dailying, setDailying] = useState(false);
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(null);
  const [dailyError, setDailyError] = useState<string | null>(null);

  const handleAllPage = async () => {
    setAllPaging(true);
    setAllPageError(null);
    setAllPageResult(null);
    try {
      const res = await fetch("/api/sync-allpage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) setAllPageError(data.error ?? "เกิดข้อผิดพลาด");
      else setAllPageResult(data);
    } catch (err) {
      setAllPageError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setAllPaging(false);
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillError(null);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/sync-backfill", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setBackfillError(data.error ?? "เกิดข้อผิดพลาด");
      else setBackfillResult(data);
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBackfilling(false);
    }
  };

  const handleDaily = async () => {
    setDailying(true);
    setDailyError(null);
    setDailyResult(null);
    try {
      const res = await fetch("/api/sync-daily", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setDailyError(data.error ?? "เกิดข้อผิดพลาด");
      else setDailyResult(data);
    } catch (err) {
      setDailyError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setDailying(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="flex items-center gap-3 mb-2" data-aos="fade-down">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sync Panel</h1>
        </div>

        {/* Get All Page */}
        <div className="bg-white border border-purple-200 rounded-xl p-5 shadow-sm" data-aos="fade-up" data-aos-delay="100">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Get All Page → Supabase &quot;allpage&quot;
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึงข้อมูล account จาก rawdata แล้วบันทึกลงตาราง allpage
          </p>
          <button
            onClick={handleAllPage}
            disabled={allPaging}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition shadow-sm hover:shadow-md"
          >
            {allPaging ? "กำลังดึง..." : "Get All Page"}
          </button>
          {allPageError && (
            <p className="mt-3 text-sm text-red-600">{allPageError}</p>
          )}
          {allPageResult && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-1">
                บันทึกสำเร็จ {allPageResult.count} accounts
              </p>
              <ul className="text-sm text-green-700 space-y-0.5">
                {allPageResult.accounts.map((a) => (
                  <li key={a.account_id}>
                    {a.account_name}{" "}
                    <span className="text-green-500 font-mono text-xs">
                      {a.account_id}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Backfill */}
        <div className="bg-white border border-orange-200 rounded-xl p-5 shadow-sm" data-aos="fade-up" data-aos-delay="200">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Backfill (6 เดือนย้อนหลัง)
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึงข้อมูลรายวันย้อนหลัง 6 เดือน เฉพาะแถวที่ spend &gt; 0
          </p>
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition shadow-sm hover:shadow-md"
          >
            {backfilling ? "กำลัง Backfill..." : "เริ่ม Backfill"}
          </button>
          {backfillError && (
            <p className="mt-3 text-sm text-red-600">{backfillError}</p>
          )}
          {backfillResult && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-1">
                Backfill สำเร็จ ({backfillResult.since} → {backfillResult.until}
                )
              </p>
              <ul className="text-sm text-green-700 space-y-0.5">
                {backfillResult.accounts.map((a) => (
                  <li key={a.id}>
                    {a.name}{" "}
                    <span className="text-green-500 font-mono text-xs">
                      {a.error
                        ? `error: ${a.error}`
                        : Object.entries(a.rows)
                            .map(([k, v]) => `${k}:${v}`)
                            .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Daily Sync */}
        <div className="bg-white border border-teal-200 rounded-xl p-5 shadow-sm" data-aos="fade-up" data-aos-delay="300">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Daily Sync (เมื่อวาน)
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึงข้อมูลเมื่อวาน แล้วลบข้อมูลที่เกิน 6 เดือนออก
          </p>
          <button
            onClick={handleDaily}
            disabled={dailying}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition shadow-sm hover:shadow-md"
          >
            {dailying ? "กำลัง Sync..." : "Daily Sync"}
          </button>
          {dailyError && (
            <p className="mt-3 text-sm text-red-600">{dailyError}</p>
          )}
          {dailyResult && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-1">
                Sync สำเร็จ — {dailyResult.date} · ลบข้อมูลก่อน{" "}
                {dailyResult.cutoff}
              </p>
              <ul className="text-sm text-green-700 space-y-0.5">
                {dailyResult.accounts.map((a) => (
                  <li key={a.id}>
                    {a.name}{" "}
                    <span className="text-green-500 font-mono text-xs">
                      {a.error
                        ? `error: ${a.error}`
                        : Object.entries(a.rows)
                            .map(([k, v]) => `${k}:${v}`)
                            .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

