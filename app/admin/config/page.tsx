"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ConfigStatus = {
  token: {
    refreshed_at: string | null;
    expires_at: string | null;
    masked: string | null;
    source: "db" | "env" | "none";
    valid: boolean | null;
    error: string | null;
  };
  ads_rawdata: {
    latest_date: string | null;
    total_rows: number;
  };
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysAgo(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "วันนี้";
  if (days === 1) return "เมื่อวาน";
  return `${days} วันที่แล้ว`;
}

function daysUntil(iso: string | null): { text: string; warn: boolean } {
  if (!iso) return { text: "", warn: false };
  const diffMs = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return { text: "หมดอายุแล้ว", warn: true };
  if (days <= 7) return { text: `อีก ${days} วัน`, warn: true };
  return { text: `อีก ${days} วัน`, warn: false };
}

export default function AdminConfigPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-3xl mx-auto text-gray-500">กำลังโหลด…</div>
        </div>
      }
    >
      <AdminConfigPageInner />
    </Suspense>
  );
}

function AdminConfigPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/admin/config");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    const data = await res.json();
    setStatus(data);
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle redirect back from /api/admin/facebook-callback
  useEffect(() => {
    const success = searchParams.get("fb_login_success");
    const error = searchParams.get("fb_login_error");
    if (success) {
      setMessage({
        type: "success",
        text: "Login Facebook สำเร็จ — token ใหม่บันทึกลง DB แล้ว",
      });
      router.replace("/admin/config");
      loadStatus();
    } else if (error) {
      setMessage({ type: "error", text: `Login Facebook ไม่สำเร็จ: ${error}` });
      router.replace("/admin/config");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleRefresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/config", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: "success",
          text: `Refresh สำเร็จ — token ใหม่: ${data.masked} (อายุ ${Math.round(
            (data.expires_in ?? 0) / 86400,
          )} วัน)`,
        });
        await loadStatus();
      } else {
        setMessage({
          type: "error",
          text: data.error ?? "Refresh failed",
        });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Refresh failed",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSaveToken() {
    if (!manualToken.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/refresh-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: manualToken.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: "success",
          text: `บันทึก token สำเร็จ — ${data.masked} (อายุ ${Math.round((data.expires_in ?? 0) / 86400)} วัน)`,
        });
        setManualToken("");
        await loadStatus();
      } else {
        setMessage({ type: "error", text: data.error ?? "บันทึกไม่สำเร็จ" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto text-gray-500">กำลังโหลด…</div>
      </div>
    );
  }

  if (!status) return null;

  const expiry = daysUntil(status.token.expires_at);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">System Config</h1>
          <a
            href="/admin"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← กลับหน้า Admin
          </a>
        </div>

        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* FB Token Status */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Facebook Access Token
            </h2>
            <div className="flex gap-2">
              <a
                href="/api/admin/facebook-login"
                className="text-sm bg-[#1877F2] hover:bg-[#1461cc] text-white px-4 py-1.5 rounded-lg"
              >
                🔗 Login Facebook ใหม่
              </a>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-1.5 rounded-lg"
              >
                {refreshing ? "กำลัง refresh…" : "🔄 Refresh ตอนนี้"}
              </button>
            </div>
          </div>

          {status.token.valid === false && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-800">
              <p className="font-semibold">⚠️ Token ใช้งานไม่ได้แล้ว</p>
              <p className="mt-1">{status.token.error}</p>
              <p className="mt-1">
                กด &quot;🔗 Login Facebook ใหม่&quot; ด้านบน → login →
                token ใหม่จะถูกบันทึกลง DB ให้อัตโนมัติ
              </p>
            </div>
          )}
          {status.token.valid === true && (
            <div className="mb-4 p-2.5 rounded-lg text-sm bg-emerald-50 border border-emerald-200 text-emerald-800">
              ✅ Token ใช้งานได้ตอนนี้
            </div>
          )}

          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-gray-500">Token (masked)</dt>
            <dd className="font-mono text-gray-900">
              {status.token.masked ?? (
                <span className="text-red-600">ไม่มี token</span>
              )}
            </dd>

            <dt className="text-gray-500">แหล่งที่มา</dt>
            <dd className="text-gray-900">
              {status.token.source === "db" ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                  Database (auto-refresh ทำงาน)
                </span>
              ) : status.token.source === "env" ? (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <span className="w-2 h-2 bg-amber-500 rounded-full" />
                  .env (ยังไม่เคย refresh)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-red-700">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  ไม่พบ
                </span>
              )}
            </dd>

            <dt className="text-gray-500">Refresh ล่าสุด</dt>
            <dd className="text-gray-900">
              {fmtDateTime(status.token.refreshed_at)}
              {status.token.refreshed_at && (
                <span className="ml-2 text-gray-400">
                  ({daysAgo(status.token.refreshed_at)})
                </span>
              )}
            </dd>

            <dt className="text-gray-500">หมดอายุ</dt>
            <dd>
              <span className="text-gray-900">
                {fmtDateTime(status.token.expires_at)}
              </span>
              {expiry.text && (
                <span
                  className={`ml-2 font-medium ${
                    expiry.warn ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  ({expiry.text})
                </span>
              )}
            </dd>
          </dl>
        </div>

        {/* Manual Token Input */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            ใส่ Token ตรงๆ
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            วาง Facebook Access Token ใหม่เพื่อบันทึกลงฐานข้อมูลทันที
          </p>
          <textarea
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="วาง access token ที่นี่…"
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          />
          <button
            type="button"
            onClick={handleSaveToken}
            disabled={saving || !manualToken.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl transition text-sm"
          >
            {saving ? "กำลังบันทึก…" : "บันทึก Token"}
          </button>
        </div>

        {/* ads_rawdata Status */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            ads_rawdata
          </h2>

          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-gray-500">วันที่ล่าสุดของข้อมูล</dt>
            <dd className="text-gray-900">
              {status.ads_rawdata.latest_date ?? (
                <span className="text-red-600">ไม่มีข้อมูล</span>
              )}
              {status.ads_rawdata.latest_date && (
                <span className="ml-2 text-gray-400">
                  ({daysAgo(status.ads_rawdata.latest_date)})
                </span>
              )}
            </dd>

            <dt className="text-gray-500">จำนวนแถวทั้งหมด</dt>
            <dd className="text-gray-900">
              {status.ads_rawdata.total_rows.toLocaleString("th-TH")} แถว
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
