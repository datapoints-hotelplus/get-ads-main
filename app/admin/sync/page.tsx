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
type TikTokSyncResult = {
  success: boolean;
  since: string;
  until: string;
  advertisers: {
    advertiser_id: string;
    advertiser_name: string;
    rows: number;
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


  const [syncing7, setSyncing7] = useState(false);
  const [sync7Result, setSync7Result] = useState<BackfillResult | null>(null);
  const [sync7Error, setSync7Error] = useState<string | null>(null);

  const [syncingLatest, setSyncingLatest] = useState(false);
  const [syncLatestResult, setSyncLatestResult] = useState<LatestResult | null>(
    null,
  );
  const [syncLatestError, setSyncLatestError] = useState<string | null>(null);

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

  const [tiktokSyncing, setTiktokSyncing] = useState(false);
  const [tiktokResult, setTiktokResult] = useState<TikTokSyncResult | null>(null);
  const [tiktokError, setTiktokError] = useState<string | null>(null);

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

  const handleTiktokSync = async () => {
    setTiktokSyncing(true);
    setTiktokError(null);
    setTiktokResult(null);
    try {
      const res = await fetch("/api/tiktok/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setTiktokError(data.error ?? "เกิดข้อผิดพลาด");
      else setTiktokResult(data);
    } catch (err) {
      setTiktokError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setTiktokSyncing(false);
    }
  };

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
                <span className="font-mono">
                  {syncLatestResult.latestDate ?? "ไม่มี"}
                </span>
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
        {/* TikTok Backfill */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            TikTok — Backfill ย้อนหลัง 365 วัน
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึงข้อมูล TikTok Ads ทีละ 30 วัน แล้ว upsert ลง tiktok_ads_rawdata
          </p>
          <button
            onClick={handleTiktokSync}
            disabled={tiktokSyncing}
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition"
          >
            {tiktokSyncing ? "กำลัง Sync TikTok..." : "Backfill TikTok"}
          </button>
          {tiktokError && (
            <p className="mt-3 text-sm text-red-600">{tiktokError}</p>
          )}
          {tiktokResult && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-1">
                Sync สำเร็จ ({tiktokResult.since} → {tiktokResult.until})
              </p>
              <ul className="text-sm text-green-700 space-y-0.5">
                {tiktokResult.advertisers.map((a) => (
                  <li key={a.advertiser_id}>
                    {a.advertiser_name}{" "}
                    <span className="text-green-500 font-mono text-xs">
                      {a.error ? `error: ${a.error}` : `${a.rows} rows`}
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
            {(
              [
                "ads_rawdata",
                "ads_geo",
                "ads_demographic",
                "ads_device",
              ] as const
            ).map((t) => (
              <label
                key={t}
                className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={clearTables.includes(t)}
                  onChange={(e) =>
                    setClearTables((prev) =>
                      e.target.checked
                        ? [...prev, t]
                        : prev.filter((x) => x !== t),
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
              <p className="text-green-800 font-semibold text-sm mb-1">
                ผลการลบ
              </p>
              <ul className="text-sm space-y-0.5">
                {Object.entries(clearResult).map(([table, res]) => (
                  <li
                    key={table}
                    className={res.deleted ? "text-green-700" : "text-red-600"}
                  >
                    {table}:{" "}
                    {res.deleted ? "ลบสำเร็จ" : `ผิดพลาด — ${res.error}`}
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
