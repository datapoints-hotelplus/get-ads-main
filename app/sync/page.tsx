"use client";

import { useState } from "react";

interface AccountRow {
  name: string;
  account_id: string;
}

export default function SyncPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  const [syncingAccounts, setSyncingAccounts] = useState(false);
  const [accountsResult, setAccountsResult] = useState<{
    count: number;
    accounts: AccountRow[];
  } | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  type SheetStats = { updated: number; appended: number };
  type InsightsSyncResult = {
    success: boolean;
    date_preset: string;
    sheets: { rawdata: SheetStats; geo: SheetStats; demographic: SheetStats; device: SheetStats };
    accounts: { name: string; id: string; rows: Record<string, number>; error?: string }[];
  };

  type BackfillResult = {
    success: boolean;
    since: string;
    until: string;
    accounts: { name: string; id: string; rows: Record<string, number>; error?: string }[];
  };

  const [datePreset, setDatePreset] = useState<"maximum" | "yesterday">("maximum");
  const [syncingInsights, setSyncingInsights] = useState(false);
  const [insightsResult, setInsightsResult] = useState<InsightsSyncResult | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  type DailyResult = {
    success: boolean;
    date: string;
    cutoff: string;
    accounts: { name: string; id: string; rows: Record<string, number>; error?: string }[];
  };

  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const [dailying, setDailying] = useState(false);
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(null);
  const [dailyError, setDailyError] = useState<string | null>(null);


  const handleSync = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/sync-facebook-data", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError({
        error: "Network error",
        details: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncInsights = async () => {
    setSyncingInsights(true);
    setInsightsError(null);
    setInsightsResult(null);

    try {
      const response = await fetch(`/api/sync-insights?date_preset=${datePreset}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) setInsightsError(data.error ?? "เกิดข้อผิดพลาด");
      else setInsightsResult(data);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSyncingInsights(false);
    }
  };

const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillError(null);
    setBackfillResult(null);
    try {
      const response = await fetch("/api/sync-backfill", { method: "POST" });
      const data = await response.json();
      if (!response.ok) setBackfillError(data.error ?? "เกิดข้อผิดพลาด");
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
      const response = await fetch("/api/sync-daily", { method: "POST" });
      const data = await response.json();
      if (!response.ok) setDailyError(data.error ?? "เกิดข้อผิดพลาด");
      else setDailyResult(data);
    } catch (err) {
      setDailyError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setDailying(false);
    }
  };

  const handleSyncAccounts = async () => {
    setSyncingAccounts(true);
    setAccountsError(null);
    setAccountsResult(null);

    try {
      const response = await fetch("/api/sync-adaccounts", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setAccountsError(data.error ?? "เกิดข้อผิดพลาด");
      } else {
        setAccountsResult(data);
      }
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSyncingAccounts(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Facebook to Google Sheets Sync
          </h1>
          <p className="text-gray-600 mb-8">
            Sync Facebook page data to your Google Sheet
          </p>

          {/* Backfill */}
          <div className="mb-6 p-5 border border-orange-200 rounded-lg bg-orange-50">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Backfill (2025-01-01 → วันนี้)
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              ดึงข้อมูลรายวัน (time_increment=1) เฉพาะแถวที่ spend &gt; 0
              แยก tab ตามปี เช่น &quot;2025&quot;, &quot;2026&quot;
            </p>
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              {backfilling ? "กำลัง Backfill..." : "เริ่ม Backfill"}
            </button>
            {backfillError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {backfillError}
              </div>
            )}
            {backfillResult && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-semibold text-sm mb-2">
                  Backfill สำเร็จ ({backfillResult.since} → {backfillResult.until})
                </p>
                <ul className="text-sm text-green-700 space-y-1">
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

          {/* Daily sync */}
          <div className="mb-6 p-5 border border-teal-200 rounded-lg bg-teal-50">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Daily Sync → Supabase (เมื่อวาน)
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              ดึงข้อมูลเมื่อวาน แล้วลบวันที่เกิน 6 เดือนออก — DB มีแค่ย้อนหลัง 6 เดือนเสมอ
            </p>
            <button
              onClick={handleDaily}
              disabled={dailying}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              {dailying ? "กำลัง Sync..." : "Daily Sync (เมื่อวาน)"}
            </button>
            {dailyError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {dailyError}
              </div>
            )}
            {dailyResult && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-semibold text-sm mb-2">
                  Sync สำเร็จ — {dailyResult.date} · ลบข้อมูลก่อน {dailyResult.cutoff}
                </p>
                <ul className="text-sm text-green-700 space-y-1">
                  {dailyResult.accounts.map((a) => (
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

          {/* Sync Insights → rawdata */}
          <div className="mb-6 p-5 border border-gray-200 rounded-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Sync Insights → Sheet &quot;rawdata&quot;
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              วนลูปทุก Account ID จาก sheet PageIDs แล้วดึง Insights
              (campaign, ad, region) บันทึกลง sheet rawdata
            </p>

            {/* Date preset selector */}
            <div className="flex gap-4 mb-4">
              {(["maximum", "yesterday"] as const).map((preset) => (
                <label key={preset} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="datePreset"
                    value={preset}
                    checked={datePreset === preset}
                    onChange={() => setDatePreset(preset)}
                    className="accent-emerald-600"
                  />
                  <span className="text-sm text-gray-700">
                    {preset === "maximum" ? "ดึงทั้งหมด" : "ดึงเมื่อวาน"}
                  </span>
                </label>
              ))}
            </div>

            <button
              onClick={handleSyncInsights}
              disabled={syncingInsights}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              {syncingInsights ? "กำลัง Sync..." : `Sync Insights (${datePreset === "maximum" ? "ทั้งหมด" : "เมื่อวาน"})`}
            </button>

            {insightsError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {insightsError}
              </div>
            )}

            {insightsResult && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-semibold text-sm mb-2">
                  Sync สำเร็จ ({insightsResult.date_preset})
                </p>
                <ul className="text-xs text-green-700 font-mono mb-2 space-y-0.5">
                  {(["rawdata", "geo", "demographic", "device"] as const).map((k) => (
                    <li key={k}>
                      {k}: +{insightsResult.sheets[k].appended} appended · {insightsResult.sheets[k].updated} updated
                    </li>
                  ))}
                </ul>
                <ul className="text-sm text-green-700 space-y-1">
                  {insightsResult.accounts.map((a) => (
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

          {/* Sync Ad Accounts */}
          <div className="mb-6 p-5 border border-gray-200 rounded-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              ดึง Ad Accounts → Sheet &quot;pageid&quot;
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              ดึงรายชื่อ Ad Account ทั้งหมดจาก token แล้วบันทึกลง Google Sheets
              หน้า pageid (ชื่อเพจ + Account ID)
            </p>
            <button
              onClick={handleSyncAccounts}
              disabled={syncingAccounts}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              {syncingAccounts ? "กำลังดึงข้อมูล..." : "ดึง Ad Accounts"}
            </button>

            {accountsError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {accountsError}
              </div>
            )}

            {accountsResult && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-semibold text-sm mb-2">
                  บันทึกสำเร็จ {accountsResult.count} accounts
                </p>
                <ul className="text-sm text-green-700 space-y-1">
                  {accountsResult.accounts.map((a) => (
                    <li key={a.account_id}>
                      {a.name}{" "}
                      <span className="text-green-500 font-mono text-xs">
                        act_{a.account_id}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sync Facebook Page Data */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Sync Facebook Page Data
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Sync ข้อมูล Facebook page data ไปยัง Google Sheets
            </p>
            <button
              onClick={handleSync}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              {loading ? "Syncing..." : "Start Sync"}
            </button>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h2 className="text-lg font-bold text-red-900 mb-2">Error</h2>
              <p className="text-red-700 mb-2">{error.error}</p>
              {error.details && (
                <p className="text-red-600 text-sm">{error.details}</p>
              )}
              {error.data && (
                <div className="mt-2 text-red-600 text-sm">
                  <strong>Details:</strong>
                  <pre className="bg-red-100 p-2 rounded mt-1 overflow-auto">
                    {JSON.stringify(error.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h2 className="text-lg font-bold text-green-900 mb-2">
                Success!
              </h2>
              <p className="text-green-700 mb-2">{result.message}</p>
              <div className="text-green-600 text-sm space-y-1">
                <p>
                  <strong>Pages Processed:</strong> {result.data.pagesProcessed}
                </p>
                <p>
                  <strong>Rows Inserted:</strong> {result.data.rowsInserted}
                </p>
                <p>
                  <strong>Timestamp:</strong>{" "}
                  {new Date(result.data.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          <div className="border-t pt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Configuration
            </h2>
            <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 space-y-2">
              <p>
                <strong>Environment Variables Required:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>FB_ACCESS_TOKEN - Your Facebook access token</li>
                <li>GOOGLE_SHEETS_ID - Your Google Sheet ID</li>
                <li>
                  GOOGLE_CREDENTIALS_JSON - Google service account credentials
                  JSON
                </li>
              </ul>
              <p className="mt-4">
                <strong>Google Sheet Setup:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Create a sheet named "PageIDs"</li>
                <li>Add header "Page ID" in cell A1</li>
                <li>Add Facebook page IDs in column A, starting from A2</li>
              </ul>
              <p className="mt-4 text-gray-600">
                Check SETUP_GUIDE.md for detailed configuration instructions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
