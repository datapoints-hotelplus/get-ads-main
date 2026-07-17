"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminNav from "@/app/components/AdminNav";

export default function AdminSyncPage() {
  const router = useRouter();

  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{
    success: boolean;
    since: string;
    until: string;
    accounts: { name: string; id: string; rows: Record<string, number>; error?: string }[];
  } | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillTables, setBackfillTables] = useState<string[]>([
    "rawdata", "geo", "demographic", "device",
  ]);

  const [resyncing, setResyncing] = useState(false);
  const [resyncResult, setResyncResult] = useState<{
    success: boolean;
    dateFrom: string;
    dateTo: string;
    totalFetched: number;
    totalUpdated: number;
    accounts_synced: number;
    summary: { account: string; rows_fetched: number; rows_updated: number; error?: string }[];
  } | null>(null);
  const [resyncError, setResyncError] = useState<string | null>(null);

  const [catchingUp, setCatchingUp] = useState(false);
  const [catchupResult, setCatchupResult] = useState<{
    success: boolean;
    message?: string;
    last_date?: string;
    since?: string;
    until?: string;
    synced_days?: number;
  } | null>(null);
  const [catchupError, setCatchupError] = useState<string | null>(null);

  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<Record<
    string,
    { deleted: boolean; error?: string }
  > | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearTables, setClearTables] = useState<string[]>([
    "ads_rawdata",
    "ads_geo",
    "ads_demographic",
    "ads_device",
  ]);
  const [clearDateFrom, setClearDateFrom] = useState("");
  const [clearDateTo, setClearDateTo] = useState("");

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillError(null);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/sync-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables: backfillTables }),
      });
      const data = await res.json();
      if (!res.ok) setBackfillError(data.error ?? "เกิดข้อผิดพลาด");
      else setBackfillResult(data);
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBackfilling(false);
    }
  };

  const handleCatchup = async () => {
    setCatchingUp(true);
    setCatchupError(null);
    setCatchupResult(null);
    try {
      const res = await fetch("/api/sync-catchup");
      const data = await res.json();
      if (!res.ok) setCatchupError(data.error ?? "เกิดข้อผิดพลาด");
      else setCatchupResult(data);
    } catch (err) {
      setCatchupError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setCatchingUp(false);
    }
  };

  const handleResync = async () => {
    setResyncing(true);
    setResyncError(null);
    setResyncResult(null);
    try {
      const res = await fetch("/api/sync-resync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setResyncError(data.error ?? "เกิดข้อผิดพลาด");
      else setResyncResult(data);
    } catch (err) {
      setResyncError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setResyncing(false);
    }
  };

  const handleClearData = async () => {
    if (clearTables.length === 0) return;
    const rangeLabel =
      clearDateFrom && clearDateTo
        ? ` (${clearDateFrom} ถึง ${clearDateTo})`
        : " (ทั้งหมด)";
    const confirmed = window.confirm(
      `ยืนยันลบข้อมูลใน: ${clearTables.join(", ")}${rangeLabel}\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`,
    );
    if (!confirmed) return;
    setClearing(true);
    setClearError(null);
    setClearResult(null);
    try {
      const body: Record<string, unknown> = { tables: clearTables };
      if (clearDateFrom && clearDateTo) {
        body.dateFrom = clearDateFrom;
        body.dateTo = clearDateTo;
      }
      const res = await fetch("/api/admin/clear-data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setClearError(data.error ?? "เกิดข้อผิดพลาด");
      else setClearResult(data.results);
    } catch (err) {
      setClearError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setClearing(false);
    }
  };

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AdminNav subtitle="Admin — Sync Panel" />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <h1 className="text-xl font-bold text-gray-900">Sync Panel</h1>

        {/* Backfill */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Backfill (ตั้งแต่วันแรกใน DB)
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            ดึงข้อมูลตั้งแต่วันแรกใน rawdata จนถึงวันนี้ใหม่ทั้งหมด เฉพาะแถวที่ spend &gt; 0
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            {(["rawdata", "geo", "demographic", "device"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backfillTables.includes(t)}
                  onChange={(e) =>
                    setBackfillTables((prev) =>
                      e.target.checked ? [...prev, t] : prev.filter((x) => x !== t),
                    )
                  }
                  className="accent-blue-600"
                />
                {t}
              </label>
            ))}
          </div>
          <button
            onClick={handleBackfill}
            disabled={backfilling || backfillTables.length === 0}
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
                Backfill สำเร็จ ({backfillResult.since} → {backfillResult.until})
              </p>
              <ul className="text-sm text-green-700 space-y-0.5">
                {backfillResult.accounts.map((a) => (
                  <li key={a.id}>
                    {a.name}{" "}
                    <span className="text-green-500 font-mono text-xs">
                      {a.error
                        ? `error: ${a.error}`
                        : Object.entries(a.rows).map(([k, v]) => `${k}:${v}`).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Catchup - เติมข้อมูลที่ขาด */}
        <div className="bg-white border border-green-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Catchup (เติมข้อมูลที่ขาด)
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            หาวันล่าสุดใน DB แล้ว sync ต่อจากวันถัดไปถึงเมื่อวาน · ไม่ดึงวันนี้เพราะข้อมูลยังไม่ครบ
          </p>
          <button
            onClick={handleCatchup}
            disabled={catchingUp}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition"
          >
            {catchingUp ? "กำลัง Catchup..." : "Catchup ข้อมูลที่ขาด"}
          </button>
          {catchupError && (
            <p className="mt-3 text-sm text-red-600">{catchupError}</p>
          )}
          {catchupResult && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-sm">
              {catchupResult.synced_days === 0 ? (
                <p className="text-green-700 font-semibold">{catchupResult.message ?? "ข้อมูลเป็นปัจจุบันแล้ว"}</p>
              ) : (
                <>
                  <p className="text-green-800 font-semibold mb-1">
                    Catchup สำเร็จ · {catchupResult.since} → {catchupResult.until} ({catchupResult.synced_days} วัน)
                  </p>
                  <p className="text-green-600 text-xs">วันล่าสุดก่อน sync: {catchupResult.last_date}</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Resync - Smart Update */}
        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Resync (Smart Update)
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึงข้อมูลตั้งแต่วันแรกถึงวันนี้ · เปรียบเทียบ Hash · Update เฉพาะแถวที่เปลี่ยน
          </p>
          <button
            onClick={handleResync}
            disabled={resyncing}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition"
          >
            {resyncing ? "กำลัง Resync..." : "Resync ทั้งหมด"}
          </button>
          {resyncError && (
            <p className="mt-3 text-sm text-red-600">{resyncError}</p>
          )}
          {resyncResult && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-1">
                Resync สำเร็จ · ดึง {resyncResult.totalFetched}, อัปเดต {resyncResult.totalUpdated}
              </p>
              <ul className="text-sm text-green-700 space-y-0.5">
                {resyncResult.summary.map((a) => (
                  <li key={a.account}>
                    {a.account}{" "}
                    <span className="text-green-500 font-mono text-xs">
                      {a.error
                        ? `error: ${a.error}`
                        : `ดึง:${a.rows_fetched} อัปเดต:${a.rows_updated}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Clear Data */}
        <div className="bg-white border border-red-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-red-700 mb-1">
            ลบข้อมูลในฐานข้อมูล
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ลบข้อมูลออกจากตารางที่เลือก สามารถระบุช่วงวันที่หรือลบทั้งหมด
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            {(["ads_rawdata", "ads_geo", "ads_demographic", "ads_device"] as const).map((t) => (
              <label
                key={t}
                className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={clearTables.includes(t)}
                  onChange={(e) =>
                    setClearTables((prev) =>
                      e.target.checked ? [...prev, t] : prev.filter((x) => x !== t),
                    )
                  }
                  className="accent-red-600"
                />
                {t}
              </label>
            ))}
          </div>
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                วันเริ่มต้น (ไม่บังคับ)
              </label>
              <input
                type="date"
                value={clearDateFrom}
                onChange={(e) => setClearDateFrom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                วันสิ้นสุด (ไม่บังคับ)
              </label>
              <input
                type="date"
                value={clearDateTo}
                onChange={(e) => setClearDateTo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            onClick={handleClearData}
            disabled={clearing || clearTables.length === 0}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition"
          >
            {clearing ? "กำลังลบ..." : "ลบข้อมูล"}
          </button>
          {clearError && (
            <p className="mt-3 text-sm text-red-600">{clearError}</p>
          )}
          {clearResult && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-1">ผลการลบ</p>
              <ul className="text-sm space-y-0.5">
                {Object.entries(clearResult).map(([table, res]) => (
                  <li
                    key={table}
                    className={res.deleted ? "text-green-700" : "text-red-600"}
                  >
                    {table}: {res.deleted ? "ลบสำเร็จ" : `ผิดพลาด — ${res.error}`}
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
