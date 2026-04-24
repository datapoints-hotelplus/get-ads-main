"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
type LatestResult = {
  success: boolean;
  latestDate: string;
  since: string;
  until: string;
  accounts: {
    name: string;
    id: string;
    rows: Record<string, number>;
    error?: string;
  }[];
};

export default function AdminSyncPage() {
  const router = useRouter();

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

  const [syncing7, setSyncing7] = useState(false);
  const [sync7Result, setSync7Result] = useState<BackfillResult | null>(null);
  const [sync7Error, setSync7Error] = useState<string | null>(null);

  const [syncingLatest, setSyncingLatest] = useState(false);
  const [syncLatestResult, setSyncLatestResult] = useState<LatestResult | null>(null);
  const [syncLatestError, setSyncLatestError] = useState<string | null>(null);

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

  const handleSync7 = async () => {
    setSyncing7(true);
    setSync7Error(null);
    setSync7Result(null);
    try {
      const res = await fetch("/api/sync-7days");
      const data = await res.json();
      if (!res.ok) setSync7Error(data.error ?? "เกิดข้อผิดพลาด");
      else setSync7Result(data);
    } catch (err) {
      setSync7Error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSyncing7(false);
    }
  };

  const handleSyncLatest = async () => {
    setSyncingLatest(true);
    setSyncLatestError(null);
    setSyncLatestResult(null);
    try {
      const res = await fetch("/api/sync-latest");
      const data = await res.json();
      if (!res.ok) setSyncLatestError(data.error ?? "เกิดข้อผิดพลาด");
      else setSyncLatestResult(data);
    } catch (err) {
      setSyncLatestError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSyncingLatest(false);
    }
  };

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-primary px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
            <span className="text-primary font-bold text-sm">H+</span>
          </div>
          <div>
            <span className="text-lg font-bold text-secondary tracking-tight block leading-tight">
              HOTEL PLUS
            </span>
            <span className="text-xs text-secondary/70">
              Admin — Sync Panel
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-secondary/80 hover:text-secondary font-medium"
          >
            Manage Accounts
          </button>
          <button
            onClick={() => router.push("/admin/users")}
            className="text-sm text-secondary/80 hover:text-secondary font-medium"
          >
            Manage Users
          </button>
          <button
            onClick={() => router.push("/admin/highlights")}
            className="text-sm text-secondary/80 hover:text-secondary font-medium"
          >
            Highlight Metrics
          </button>
          <button
            onClick={() => router.push("/admin/docs")}
            className="text-sm text-secondary/80 hover:text-secondary font-medium"
          >
            📖 วิธีใช้
          </button>
          <button
            onClick={handleLogout}
            className="text-sm bg-secondary text-white font-medium px-3 py-1.5 rounded-lg hover:bg-secondary-light transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <h1 className="text-xl font-bold text-gray-900">Sync Panel</h1>

        {/* Get All Page */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Get All Page → Supabase &quot;allpage&quot;
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึงข้อมูล account จาก rawdata แล้วบันทึกลงตาราง allpage
          </p>
          <button
            onClick={handleAllPage}
            disabled={allPaging}
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition"
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
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Backfill (12 เดือนย้อนหลัง)
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึงข้อมูลรายวันย้อนหลัง 12 เดือน เฉพาะแถวที่ spend &gt; 0
          </p>
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition"
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
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Daily Sync (เมื่อวาน)
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึงข้อมูลเมื่อวาน แล้วลบข้อมูลที่เกิน 6 เดือนออก
          </p>
          <button
            onClick={handleDaily}
            disabled={dailying}
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition"
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

        {/* Today Sync */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            ดึงข้อมูลวันนี้
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึงข้อมูลตั้งแต่ 00:00 ถึงตอนนี้ของวันปัจจุบัน แล้ว upsert เข้า
            Supabase
          </p>
          <button
            onClick={handleSync7}
            disabled={syncing7}
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition"
          >
            {syncing7 ? "กำลัง Sync..." : "ดึงข้อมูลวันนี้"}
          </button>
          {sync7Error && (
            <p className="mt-3 text-sm text-red-600">{sync7Error}</p>
          )}
          {sync7Result && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-1">
                Sync สำเร็จ ({sync7Result.since} → {sync7Result.until})
              </p>
              <ul className="text-sm text-green-700 space-y-0.5">
                {sync7Result.accounts.map((a) => (
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
        {/* Sync Latest */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            อัปเดตข้อมูลให้เป็นล่าสุด
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            เช็ควันที่ล่าสุดในฐานข้อมูล แล้วดึงข้อมูลตั้งแต่วันนั้นถึงวันนี้
          </p>
          <button
            onClick={handleSyncLatest}
            disabled={syncingLatest}
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition"
          >
            {syncingLatest ? "กำลัง Sync..." : "อัปเดตข้อมูลให้เป็นล่าสุด"}
          </button>
          {syncLatestError && (
            <p className="mt-3 text-sm text-red-600">{syncLatestError}</p>
          )}
          {syncLatestResult && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-1">
                Sync สำเร็จ — ข้อมูลล่าสุดเดิม:{" "}
                <span className="font-mono">{syncLatestResult.latestDate ?? "ไม่มี"}</span>
                {" → "}ดึงตั้งแต่{" "}
                <span className="font-mono">{syncLatestResult.since}</span>
                {" ถึง "}
                <span className="font-mono">{syncLatestResult.until}</span>
              </p>
              <ul className="text-sm text-green-700 space-y-0.5">
                {syncLatestResult.accounts.map((a) => (
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
    </div>
  );
}
