"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminNav from "@/app/components/AdminNav";

/**
 * A long sync can outrun the serverless function's time limit — the
 * platform then returns an HTML timeout page instead of JSON, and a plain
 * `res.json()` throws an unhelpful "unexpected character" parse error.
 * Detect that case and surface it plainly instead.
 */
async function safeJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      res.ok
        ? "Server ตอบกลับมาไม่ใช่ JSON (อาจ timeout ระหว่างทำงาน) — sync อาจยังทำงานค้างอยู่ ลองเช็คสถานะอีกครั้งสักครู่"
        : `เกิดข้อผิดพลาด (HTTP ${res.status}) — sync อาจใช้เวลานานเกินไปจน timeout`,
    );
  }
}

type StatusResult = {
  connected: boolean;
  last_sync: { status: string; started_at: string; finished_at: string | null; error_message: string | null } | null;
  last_success_at: string | null;
  consecutive_failures: number;
  outage_minutes: number | null;
  refresh_days_left: number | null;
  // EC5/EC8/EC9/AC13
  syncing: boolean;
  status_detail: string | null;
  progress: { completed: number; total: number | null } | null;
  sync_paused: boolean;
  sync_paused_reason: string | null;
};

type AdvertiserResult = {
  advertiser_id: string;
  advertiser_name: string;
  rows: number;
  error?: string;
};

type SyncResult = {
  success: boolean;
  since: string | null;
  until: string | null;
  advertisers: AdvertiserResult[];
};

type HeatmapSyncResult = {
  success: boolean;
  since: string;
  until: string;
  total_rows: number;
  advertisers: AdvertiserResult[];
};

type CheckResult = {
  ok: boolean;
  token_preview: string;
  count: number;
  advertisers: { advertiser_id: string; advertiser_name: string }[];
};

type RefreshResult = {
  ok: boolean;
  access_token: string;
  access_token_expires_in: number;
  new_refresh_token: string;
  advertiser_ids: string[];
  instruction: string;
};

export default function TikTokSyncPage() {
  const router = useRouter();

  // ── Connection status (F05, F24) ───────────────────────────────────────
  const [status, setStatus] = useState<StatusResult | null>(null);

  const fetchStatus = () => {
    fetch("/api/tiktok/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    // EC5/EC9/AC13: keep polling while a sync is running (this tab's own
    // "Sync Data" click, or one kicked off elsewhere — n8n/cron, another
    // admin) so the progress bar below stays live either way.
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, []);

  // ── OAuth callback result (?tiktok_login_success=1 / ?tiktok_login_error=...) ──
  const [loginMessage, setLoginMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("tiktok_login_error");
    const ok = params.get("tiktok_login_success");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the OAuth callback's query params, not the derived-state anti-pattern
    if (err) setLoginMessage({ ok: false, text: err });
    else if (ok) setLoginMessage({ ok: true, text: "เชื่อมต่อ TikTok Account สำเร็จ" });
    if (err || ok) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // ── Refresh Token state ───────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(
    null,
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRefreshToken = async () => {
    setRefreshing(true);
    setRefreshError(null);
    setRefreshResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/tiktok/refresh-token", { method: "POST" });
      const data = await safeJson<RefreshResult & { error?: string }>(res);
      if (!res.ok) setRefreshError(data.error ?? "เกิดข้อผิดพลาด");
      else setRefreshResult(data);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Check Ad Account state ─────────────────────────────────────────────
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const handleCheck = async (overrideToken?: string) => {
    setChecking(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const url = overrideToken
        ? `/api/tiktok/check-accounts?token=${encodeURIComponent(overrideToken)}`
        : "/api/tiktok/check-accounts";
      const res = await fetch(url);
      const data = await safeJson<CheckResult & { error?: string }>(res);
      if (!res.ok) {
        setCheckError(data.error ?? "เกิดข้อผิดพลาด");
      } else {
        setCheckResult(data);
      }
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setChecking(false);
    }
  };

  // ── Sync state ────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lookback window for the next Sync Data click — "3m" (90 days, faster)
  // or "all" (3 years, same window a brand-new advertiser gets automatically).
  const [lookback, setLookback] = useState<"3m" | "all">("3m");

  // F13: Timing Heatmap sync — separate endpoint (/api/tiktok/sync-heatmap),
  // never had a UI button before this (only reachable via n8n/curl per
  // docs/N8N_CRON_ENDPOINTS.md), so tiktok_hourly_stats stayed empty for
  // anyone who hadn't wired that up — the Heatmap tab on the dashboard
  // just showed all-zero cells with no way to fix it from the browser.
  const [heatmapSyncing, setHeatmapSyncing] = useState(false);
  const [heatmapResult, setHeatmapResult] = useState<HeatmapSyncResult | null>(null);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const handleSyncHeatmap = async () => {
    setHeatmapSyncing(true);
    setHeatmapError(null);
    setHeatmapResult(null);
    try {
      const res = await fetch("/api/tiktok/sync-heatmap", { method: "POST" });
      const data = await safeJson<HeatmapSyncResult & { error?: string }>(res);
      if (!res.ok) {
        setHeatmapError(data.error ?? "เกิดข้อผิดพลาด");
      } else {
        setHeatmapResult(data);
      }
    } catch (err) {
      setHeatmapError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setHeatmapSyncing(false);
    }
  };

  // ── Interest-category names debug refetch (see Interest Alignment
  //    parsing fix on the dashboard) — separate from the full sync so it
  //    can be re-triggered fast while confirming TikTok's response shape.
  const [namesSyncing, setNamesSyncing] = useState(false);
  const [namesResult, setNamesResult] = useState<{ advertisers_checked: number; names_found: number } | null>(null);
  const [namesError, setNamesError] = useState<string | null>(null);
  const handleSyncInterestNames = async () => {
    setNamesSyncing(true);
    setNamesError(null);
    setNamesResult(null);
    try {
      const res = await fetch("/api/tiktok/sync-interest-names", { method: "POST" });
      const data = await safeJson<{ advertisers_checked: number; names_found: number; error?: string }>(res);
      if (!res.ok) setNamesError(data.error ?? "เกิดข้อผิดพลาด");
      else setNamesResult(data);
    } catch (err) {
      setNamesError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setNamesSyncing(false);
    }
  };

  // ── Organic sync via Windsor (/api/tiktok/sync-windsor) ────────────────
  // Deliberately NOT gated on status.connected like the buttons above: this
  // route authenticates to Windsor with its own key and never touches the
  // TikTok OAuth token, so it still works while the TikTok connection is
  // down or being re-authorized.
  type WindsorSyncResult = {
    date_preset: string;
    account_rows: number;
    post_rows: number;
    dropped_account_fields: string[];
    dropped_video_fields: string[];
    account_date_capped: boolean;
    errors: string[];
  };
  const [windsorSyncing, setWindsorSyncing] = useState(false);
  const [windsorResult, setWindsorResult] = useState<WindsorSyncResult | null>(null);
  const [windsorError, setWindsorError] = useState<string | null>(null);
  const handleSyncWindsor = async () => {
    setWindsorSyncing(true);
    setWindsorError(null);
    setWindsorResult(null);
    try {
      const res = await fetch("/api/tiktok/sync-windsor", { method: "POST" });
      const data = await safeJson<WindsorSyncResult & { error?: string }>(res);
      // A 502 from this route carries its detail in `errors`, not `error` —
      // reading only `error` would replace a usable message with a bare
      // "something went wrong".
      if (!res.ok) setWindsorError(data.error ?? data.errors?.join(" | ") ?? "เกิดข้อผิดพลาด");
      else setWindsorResult(data);
    } catch (err) {
      setWindsorError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setWindsorSyncing(false);
    }
  };

  // ── Alert email recipients (F04/F26/F27) — admin-editable, stored in
  //    tiktok_alert_settings via /api/tiktok/alert-settings. ──────────────
  const [alertEmails, setAlertEmails] = useState(""); // textarea, one per line
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertSaved, setAlertSaved] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/tiktok/alert-settings")
      .then((r) => r.json())
      .then((d) => setAlertEmails((d.recipients ?? []).join("\n")))
      .catch(() => {});
  }, []);
  const handleSaveAlertEmails = async () => {
    setAlertSaving(true);
    setAlertError(null);
    setAlertSaved(false);
    const recipients = alertEmails.split("\n").map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch("/api/tiktok/alert-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      const data = await safeJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) setAlertError(data.error ?? "เกิดข้อผิดพลาด");
      else setAlertSaved(true);
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setAlertSaving(false);
    }
  };

  // ── Ad account list / active toggle (F06) ──────────────────────────────
  const [accounts, setAccounts] = useState<{ advertiser_id: string; advertiser_name: string; is_active: boolean }[]>([]);
  const fetchAccounts = () => {
    fetch("/api/tiktok/advertisers")
      .then((r) => r.json())
      .then((d) => setAccounts(d.advertisers ?? []))
      .catch(() => {});
  };
  useEffect(() => {
    fetchAccounts();
  }, []);
  const toggleAccount = async (advertiser_id: string, is_active: boolean) => {
    setAccounts((prev) => prev.map((a) => (a.advertiser_id === advertiser_id ? { ...a, is_active } : a)));
    await fetch("/api/tiktok/advertisers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ advertiser_id, is_active }),
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const lookbackDays = lookback === "3m" ? 90 : 365 * 3;
      const res = await fetch(`/api/tiktok/sync?lookback_days=${lookbackDays}`, { method: "POST" });
      const data = await safeJson<SyncResult & { error?: string }>(res);
      if (!res.ok) {
        setError(data.error ?? "เกิดข้อผิดพลาด");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSyncing(false);
      fetchStatus();
      fetchAccounts();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Header — same AdminNav every other admin page uses (name +
          Logout everywhere, Dashboard/Facebook Sync already covered by its
          TikTok/Facebook dropdowns) ──────────────────────────────────────── */}
      <AdminNav subtitle="TikTok — Sync Panel" />

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <h1 className="text-xl font-bold text-gray-900">TikTok — Sync Data</h1>

        {/* OAuth callback result */}
        {loginMessage && (
          <div
            className={`rounded-xl p-4 border text-sm ${
              loginMessage.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {loginMessage.text}
          </div>
        )}

        {/* ── Connect TikTok Account (F01) ──────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Connect TikTok Account</h2>
          <p className="text-sm text-gray-500 mb-4">
            ล็อกอินผ่าน TikTok Business เพื่อขอ Access Token อัตโนมัติ (แนะนำ) —
            token จะถูกเก็บใน database และ refresh ให้เองก่อนหมดอายุ
          </p>
          <a
            href="/api/tiktok/login"
            className="block w-full text-center bg-black hover:bg-gray-800 text-white font-semibold py-2.5 rounded-xl transition-colors"
          >
            Connect TikTok Account
          </a>
        </div>

        {/* ── Connection status (F05) ───────────────────────────────────── */}
        {status && (
          <div
            className={`rounded-xl p-4 border flex items-center justify-between ${
              status.connected ? "bg-green-50 border-green-200" : "bg-red-50 border-red-300"
            }`}
          >
            <div>
              <p className={`text-sm font-semibold ${status.connected ? "text-green-800" : "text-red-800"}`}>
                {status.connected ? "● Connected" : "● Disconnected — กรุณา re-authenticate"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Sync ล่าสุด:{" "}
                {status.last_success_at
                  ? new Date(status.last_success_at).toLocaleString("th-TH")
                  : "ยังไม่เคย sync สำเร็จ"}
                {status.consecutive_failures >= 2 && (
                  <span className="text-red-600"> · fail ติดกัน {status.consecutive_failures} ครั้ง</span>
                )}
              </p>
              {status.refresh_days_left != null && status.refresh_days_left <= 7 && (
                <p className="text-xs text-amber-600 font-medium mt-1">
                  ⚠ Refresh token จะหมดอายุใน {Math.max(0, status.refresh_days_left)} วัน — กด Connect TikTok Account
                  ใหม่ก่อนหมดอายุ
                </p>
              )}
              {status.connected && (status.outage_minutes ?? 0) >= 30 && (
                <p className="text-xs text-amber-600 font-medium mt-1">
                  ⚠ TikTok API มีปัญหา — sync ล้มเหลวต่อเนื่อง {status.outage_minutes} นาที
                </p>
              )}
              {status.sync_paused && (
                <p className="text-xs text-red-600 font-medium mt-1">⏸ {status.sync_paused_reason}</p>
              )}
              {/* EC5/EC9/AC13: live progress while a sync is running — this
                  tab's own click, or any other trigger (n8n, another admin) */}
              {status.syncing && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600">
                    {status.status_detail ??
                      (status.progress?.total
                        ? `กำลัง sync... ${status.progress.completed}/${status.progress.total} ad account`
                        : "กำลัง sync...")}
                  </p>
                  <div className="w-48 bg-gray-100 rounded-full h-1.5 overflow-hidden mt-1">
                    {status.progress?.total ? (
                      <div
                        className="bg-secondary h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (status.progress.completed / status.progress.total) * 100)}%` }}
                      />
                    ) : (
                      <div className="bg-secondary h-full w-1/3 rounded-full animate-pulse" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Refresh Token Card ────────────────────────────────────────── */}
        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-amber-500 text-lg">🔑</span>
            <div>
              <h2 className="text-base font-semibold text-gray-800">
                แลก Refresh Token → Access Token
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                TikTok ใช้ token 2 แบบ: <span className="font-mono">Refresh Token</span> อายุยืน
                ใช้แลก token ใหม่ได้เรื่อยๆ กับ <span className="font-mono">Access Token</span> อายุสั้น
                (~1-2 วัน) ที่แอปใช้เรียก TikTok API จริงๆ ปุ่มนี้เอา Refresh Token ที่ตั้งไว้ใน
                env ไปแลกเป็น Access Token ใหม่ — <strong>นี่คือเส้นทางแบบ manual</strong>{" "}
                สำหรับกู้คืนตอน token เก่าหมดอายุ ต่างจาก &quot;Connect TikTok Account&quot;
                ด้านบนที่ auto-refresh ให้เองไม่ต้องยุ่ง
              </p>
              <p className="text-xs text-gray-500 mt-1">
                สังเกตว่าต้องใช้ตอนไหน: ถ้า <span className="font-mono">TIKTOK_ACCESS_TOKEN</span>{" "}
                ขึ้นต้นด้วย <span className="font-mono text-amber-600">rft.</span> (แปลว่าตอนนี้
                ตั้งเป็น Refresh Token ไว้) หรือ sync เริ่ม error เพราะ token หมดอายุ — กดแล้ว
                <strong>ต้องก็อปโค้ดที่ได้ไปแปะใน .env เอง + restart server</strong> ไม่ได้บันทึกให้
                อัตโนมัติ
              </p>
            </div>
          </div>

          <button
            onClick={handleRefreshToken}
            disabled={refreshing}
            className="w-full bg-amber-400 hover:bg-amber-500 disabled:bg-gray-300 text-secondary font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {refreshing ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                กำลังแลก Token…
              </>
            ) : (
              "Refresh Token"
            )}
          </button>

          {refreshError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-xs font-mono break-all">
                {refreshError}
              </p>
            </div>
          )}

          {refreshResult && (
            <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
              <p className="text-green-800 font-semibold text-sm">
                ได้ Access Token แล้ว ✓
              </p>

              <div>
                <p className="text-xs text-gray-500 mb-1">
                  คัดลอก token ด้านล่างไปใส่ใน{" "}
                  <span className="font-mono">.env</span> →{" "}
                  <span className="font-mono">TIKTOK_ACCESS_TOKEN=</span>
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 font-mono break-all text-gray-800">
                    {refreshResult.access_token}
                  </code>
                  <button
                    onClick={() => handleCopy(refreshResult.access_token)}
                    className="shrink-0 text-xs bg-secondary text-white px-3 py-2 rounded-lg hover:bg-secondary-light transition-colors font-medium"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
                  <p className="text-gray-400">หมดอายุใน</p>
                  <p className="font-semibold">
                    {Math.round(refreshResult.access_token_expires_in / 86400)}{" "}
                    วัน
                  </p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
                  <p className="text-gray-400">Advertiser IDs</p>
                  <p className="font-mono font-semibold truncate">
                    {refreshResult.advertiser_ids.join(", ") || "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  อัปเดต .env ด้วย token ด้านบน แล้ว restart server
                </p>
                <button
                  onClick={() => handleCheck(refreshResult.access_token)}
                  disabled={checking}
                  className="shrink-0 text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  {checking ? "กำลังเทส…" : "Test Token นี้เลย"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Check Ad Account Card ─────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Check Ad Account
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            เช็คว่า token ที่ตั้งไว้ตอนนี้ (หรือเพิ่งแลกมาจากการ์ดด้านบน) ยังใช้งานได้จริง
            และเห็นบัญชีโฆษณา (Advertiser) ไหนบ้าง — เป็นแค่การทดสอบ ไม่บันทึกอะไรลง
            database กดได้บ่อยเท่าที่ต้องการ ไม่มีผลข้างเคียง ใช้เช็คก่อน Sync Data จริงด้านล่าง
          </p>

          <button
            onClick={() => handleCheck()}
            disabled={checking}
            className="w-full bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-secondary font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {checking ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                กำลังตรวจสอบ…
              </>
            ) : (
              "Check Ad Account"
            )}
          </button>

          {/* Check Error */}
          {checkError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-sm font-semibold">
                Token ไม่ถูกต้อง
              </p>
              <p className="text-red-600 text-xs mt-1 font-mono break-all">
                {checkError}
              </p>
              <p className="text-red-500 text-xs mt-2">
                กรุณาตรวจสอบ{" "}
                <span className="font-mono">TIKTOK_ACCESS_TOKEN</span> ใน .env
              </p>
            </div>
          )}

          {/* Check Success */}
          {checkResult && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <p className="text-green-800 font-semibold text-sm">
                  Token ถูกต้อง ✓
                </p>
                <span className="font-mono text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                  {checkResult.token_preview}
                </span>
              </div>
              <p className="text-green-700 text-xs font-medium mb-2">
                พบ {checkResult.count} Advertiser:
              </p>
              <ul className="space-y-1">
                {checkResult.advertisers.map((a) => (
                  <li
                    key={a.advertiser_id}
                    className="flex items-center justify-between text-xs bg-white border border-green-100 rounded-lg px-3 py-2"
                  >
                    <span className="text-gray-800 font-medium">
                      {a.advertiser_name}
                    </span>
                    <span className="font-mono text-gray-400">
                      {a.advertiser_id}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Ad Account settings (F06) */}
        {accounts.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Ad Accounts</h2>
            <p className="text-sm text-gray-500 mb-3">
              เลือกว่า Ad Account ไหนให้ sync บ้าง (ปิดไว้ = ข้ามตอน sync)
            </p>
            <ul className="space-y-1">
              {accounts.map((a) => (
                <li
                  key={a.advertiser_id}
                  className="flex items-center justify-between text-sm bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                >
                  <span className="text-gray-800 font-medium">{a.advertiser_name}</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-gray-400">{a.is_active ? "Active" : "Off"}</span>
                    <input
                      type="checkbox"
                      checked={a.is_active}
                      onChange={(e) => toggleAccount(a.advertiser_id, e.target.checked)}
                      className="w-4 h-4 accent-secondary"
                    />
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sync Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Backfill ย้อนหลัง
          </h2>
          <p className="text-sm text-gray-500 mb-1">ระบบจะ:</p>
          <ol className="text-sm text-gray-500 list-decimal list-inside mb-4 space-y-0.5">
            <li>ดึงรายชื่อ Advertiser ทั้งหมดจาก Token นี้</li>
            <li>วนดึงข้อมูลย้อนหลังตามช่วงที่เลือกด้านล่าง ทีละ 30 วัน (Chunking)</li>
            <li>
              Upsert ลง Supabase{" "}
              <span className="font-mono bg-gray-100 px-1 rounded">
                tiktok_ads_rawdata
              </span>
            </li>
          </ol>

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">ดึงข้อมูลย้อนหลัง</label>
            <select
              value={lookback}
              onChange={(e) => setLookback(e.target.value as "3m" | "all")}
              disabled={syncing || status?.syncing}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
            >
              <option value="3m">3 เดือน (เร็วกว่า)</option>
              <option value="all">ทั้งหมด (3 ปี)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-amber-600 text-sm">⏱</span>
            <p className="text-amber-700 text-xs">
              การ Sync อาจใช้เวลาหลายนาทีขึ้นอยู่กับจำนวน Advertiser
              และปริมาณข้อมูล กรุณาอย่าปิดหน้าต่างนี้
            </p>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing || status?.connected === false || status?.syncing || status?.sync_paused}
            title={
              status?.connected === false
                ? "Disconnected — re-authenticate ก่อน (ดูปุ่ม Refresh Token ด้านบน)"
                : status?.sync_paused
                  ? (status?.sync_paused_reason ?? "Sync ถูกพักไว้")
                  : status?.syncing
                    ? "Sync กำลังดำเนินการอยู่ — ดูความคืบหน้าด้านบน"
                    : undefined
            }
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {syncing || status?.syncing ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                กำลัง Sync… (อย่าปิดหน้าต่าง)
              </>
            ) : (
              "Sync Data"
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-sm font-semibold">
                เกิดข้อผิดพลาด
              </p>
              <p className="text-red-600 text-xs mt-1">{error}</p>
            </div>
          )}

          {/* Success */}
          {result && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-2">
                Sync สำเร็จ{result.since && result.until ? ` — ${result.since} → ${result.until}` : " — ไม่มี account ที่ active"}
              </p>
              <ul className="space-y-1">
                {result.advertisers.map((a) => (
                  <li
                    key={a.advertiser_id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-green-800 font-medium">
                      {a.advertiser_name}
                    </span>
                    {a.error ? (
                      <span className="text-red-500 text-xs font-mono">
                        error: {a.error}
                      </span>
                    ) : (
                      <span className="text-green-600 font-mono text-xs bg-green-100 px-2 py-0.5 rounded-full">
                        {a.rows.toLocaleString()} rows
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-3 pt-3 border-t border-green-200 flex justify-end">
                <button
                  onClick={() => router.push("/tiktok/dashboard")}
                  className="text-sm text-secondary font-semibold hover:underline"
                >
                  ดู Dashboard →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sync Timing Heatmap (F13) — separate endpoint/cadence from the
            main ads sync above, so it needs its own trigger. */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Timing Heatmap</h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึง engagement rate รายชั่วโมง 30 วันล่าสุด สำหรับ Timing Heatmap ในหน้า Dashboard — แยกจาก &quot;Sync Data&quot;
            ด้านบน ต้องกดเองอย่างน้อยครั้งแรก (แนะนำตั้ง cron ทุก 12 ชม. ตาม docs/N8N_CRON_ENDPOINTS.md ให้ดึงอัตโนมัติต่อไป)
          </p>
          <button
            onClick={handleSyncHeatmap}
            disabled={heatmapSyncing || status?.connected === false}
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {heatmapSyncing ? "กำลัง Sync…" : "Sync Timing Heatmap"}
          </button>

          {heatmapError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-sm font-semibold">เกิดข้อผิดพลาด</p>
              <p className="text-red-600 text-xs mt-1">{heatmapError}</p>
            </div>
          )}

          {heatmapResult && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-2">
                Sync สำเร็จ — {heatmapResult.since} → {heatmapResult.until} ({heatmapResult.total_rows.toLocaleString()} rows)
              </p>
              <ul className="space-y-1">
                {heatmapResult.advertisers.map((a) => (
                  <li key={a.advertiser_id} className="flex items-center justify-between text-sm">
                    <span className="text-green-800 font-medium">{a.advertiser_name ?? a.advertiser_id}</span>
                    {a.error ? (
                      <span className="text-red-500 text-xs font-mono">error: {a.error}</span>
                    ) : (
                      <span className="text-green-600 font-mono text-xs bg-green-100 px-2 py-0.5 rounded-full">
                        {a.rows.toLocaleString()} rows
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Organic data via Windsor — the only route to profile views and
            account-wide follower counts until TikTok approves our own
            Accounts API scope. Writes the same tables the TikTok route
            writes, so nothing downstream changes when we switch over. */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Organic Data (Windsor)</h2>
          <p className="text-sm text-gray-500 mb-4">
            ดึง Profile Views, ผู้ติดตามรายวัน และยอดรายคลิป ย้อนหลัง 90 วัน ผ่าน Windsor.ai — ใช้แทนไปก่อนจนกว่า TikTok
            จะอนุมัติ Accounts API ให้เราเอง เขียนลงตารางเดียวกัน สลับมาใช้ของ TikTok ได้โดยไม่ต้องแก้อะไร
            <br />
            ต้องตั้ง <code className="text-xs bg-gray-100 px-1 rounded">WINDSOR_API_KEY</code> และ{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">TIKTOK_BUSINESS_ID</code> ใน env ก่อน
          </p>
          <button
            onClick={handleSyncWindsor}
            disabled={windsorSyncing}
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {windsorSyncing ? "กำลัง Sync…" : "Sync Organic Data"}
          </button>

          {windsorError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-sm font-semibold">เกิดข้อผิดพลาด</p>
              <p className="text-red-600 text-xs mt-1">{windsorError}</p>
            </div>
          )}

          {windsorResult && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 font-semibold text-sm mb-2">
                Sync สำเร็จ ({windsorResult.date_preset})
              </p>
              <ul className="space-y-1 text-sm">
                <li className="flex items-center justify-between">
                  <span className="text-green-800 font-medium">ข้อมูลรายวัน (account)</span>
                  <span className="text-green-600 font-mono text-xs bg-green-100 px-2 py-0.5 rounded-full">
                    {windsorResult.account_rows.toLocaleString()} rows
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-green-800 font-medium">ยอดรายคลิป</span>
                  <span className="text-green-600 font-mono text-xs bg-green-100 px-2 py-0.5 rounded-full">
                    {windsorResult.post_rows.toLocaleString()} rows
                  </span>
                </li>
              </ul>
              {/* A 60-day cap on the richer account field combo used to be
                  indistinguishable from a genuine field rejection — both hit
                  the same catch block and dropped total_followers_count /
                  video_views for no reason related to those fields. Shown
                  separately now that the two are told apart server-side. */}
              {windsorResult.account_date_capped && (
                <p className="text-amber-700 text-xs mt-2">
                  Windsor จำกัดข้อมูลระดับ account (followers, video views) ไว้แค่ 60 วันล่าสุด — รอบนี้ดึงแค่ 60 วัน
                  แทน {windsorResult.date_preset} ที่ขอไว้ ค่ารายวันย้อนหลังเกิน 60 วันจากรอบก่อนหน้ายังอยู่ ไม่ถูกลบ
                </p>
              )}
              {/* Surfaced rather than swallowed: a dropped field means those
                  columns are silently 0 from here on, which reads as real data. */}
              {windsorResult.dropped_account_fields?.length > 0 && (
                <p className="text-amber-700 text-xs mt-2">
                  Windsor ปฏิเสธ field ระดับ account เหล่านี้ — ยอดผู้ติดตามรอบนี้ไม่ถูกอัปเดต (ค่าเดิมยังอยู่):{" "}
                  <span className="font-mono">{windsorResult.dropped_account_fields.join(", ")}</span>
                </p>
              )}
              {windsorResult.dropped_video_fields.length > 0 && (
                <p className="text-amber-700 text-xs mt-2">
                  Windsor ปฏิเสธ field ระดับคลิปเหล่านี้ ค่าที่เกี่ยวข้องจะเป็น 0:{" "}
                  <span className="font-mono">{windsorResult.dropped_video_fields.join(", ")}</span>
                </p>
              )}
              {windsorResult.errors.length > 0 && (
                <p className="text-red-600 text-xs mt-2 font-mono">{windsorResult.errors.join(" | ")}</p>
              )}
            </div>
          )}
        </div>

        {/* Interest-category names debug refetch — see Interest Alignment
            card on the dashboard; separate from the full sync so it's fast
            to re-run while confirming TikTok's response shape. */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Interest Category Names (debug)</h2>
          <p className="text-sm text-gray-500 mb-4">
            ใช้ตอนการ์ด &quot;Interest Alignment&quot; ในหน้า Dashboard โชว์รหัสตัวเลข
            (เช่น 101, 205) แทนชื่อหมวดจริง — ปุ่มนี้ไปดึงชื่อมาแทนรหัสให้ ไม่ต้องรัน sync เต็ม
            ไม่กระทบข้อมูลอื่นในระบบ ปกติไม่ต้องกดเอง (ส่วนหนึ่งของ Sync Data ด้านบนอยู่แล้ว) —
            มีไว้ debug ตอนชื่อหมวดยังไม่ขึ้น
          </p>
          <button
            onClick={handleSyncInterestNames}
            disabled={namesSyncing || status?.connected === false}
            className="w-full bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {namesSyncing ? "กำลังดึง…" : "Refetch Interest Names"}
          </button>

          {namesError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-sm font-semibold">เกิดข้อผิดพลาด</p>
              <p className="text-red-600 text-xs mt-1">{namesError}</p>
            </div>
          )}

          {namesResult && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-800 text-sm">
                เช็คแล้ว {namesResult.advertisers_checked} บัญชี — เจอชื่อหมวด {namesResult.names_found} รายการ
                {namesResult.names_found === 0 && " (0 = TikTok ตอบกลับแต่ยังพาร์สชื่อไม่ได้ ดู tiktok_error_log)"}
              </p>
            </div>
          )}
        </div>

        {/* Alert email recipients (F04/F26/F27) */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Alert Email</h2>
          <p className="text-sm text-gray-500 mb-4">
            อีเมลที่จะได้รับแจ้งเตือน (sync ล้มเหลว, token ใกล้หมดอายุ, field error ฯลฯ) — บรรทัดละ 1 อีเมล
          </p>
          <textarea
            value={alertEmails}
            onChange={(e) => { setAlertEmails(e.target.value); setAlertSaved(false); }}
            rows={3}
            placeholder="someone@example.com"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono mb-3"
          />
          <button
            onClick={handleSaveAlertEmails}
            disabled={alertSaving}
            className="bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-semibold py-2 px-5 rounded-xl transition-colors text-sm"
          >
            {alertSaving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          {alertSaved && <span className="ml-3 text-sm text-green-700">บันทึกแล้ว</span>}
          {alertError && <p className="text-red-600 text-xs mt-2">{alertError}</p>}
        </div>

        {/* Info card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Metrics ที่ดึง
          </h2>
          <p className="text-sm text-gray-500 mb-2">
            รายการตัวเลขที่ Sync Data ด้านบนดึงจาก TikTok API มาเก็บไว้ทุกครั้ง — ไม่ใช่ปุ่มกด
            มีไว้ดูอ้างอิงเฉยๆ ว่าข้อมูลในหน้า Dashboard มาจากไหนบ้าง
          </p>
          <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
            {[
              "spend",
              "impressions",
              "reach",
              "clicks",
              "cpm",
              "cpc",
              "average_video_play",
              "video_views",
              "video_watched_2s",
              "video_watched_6s",
              "video_view_p50",
              "video_view_p100",
              "likes",
              "comments",
              "shares",
            ].map((m) => (
              <span key={m} className="font-mono bg-gray-50 px-2 py-1 rounded">
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
