"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/app/components/AppHeader";
import { dateTimeToDisplay } from "@/app/components/dateFormat";

type LogRow = { id: string; user_id: string; username: string; page: string; ip_address: string | null; user_agent: string | null; accessed_at: string };

/** Filter value = prefix of the logged `page` (see lib/accessLog.ts callers). */
const KINDS = [
  { value: "", label: "ทั้งหมด" },
  { value: "adscan_slack", label: "Slack (ปุ่มแอดมิน)" },
  { value: "adscan_performance_report", label: "Performance Report" },
  { value: "login", label: "เข้าสู่ระบบ" },
];
const ACTION_TH: Record<string, string> = {
  adscan_slack_test: "Slack — ส่งข้อความทดสอบ",
  adscan_slack_summary: "Slack — ส่งสรุปล่าสุด",
  adscan_slack_save_url: "Slack — บันทึก Webhook URL",
  adscan_slack_enable: "Slack — เปิดการแจ้งเตือน",
  adscan_slack_disable: "Slack — ปิดการแจ้งเตือน",
  adscan_slack_save: "Slack — บันทึกการตั้งค่า",
  adscan_performance_report: "เปิด Performance Report",
  login: "เข้าสู่ระบบ",
  dashboard: "เปิด Dashboard (Facebook)",
};
const SIZES = [25, 50, 100];

export default function LogsPage() {
  return (
    <Suspense>
      <Logs />
    </Suspense>
  );
}

/**
 * Who did what, from which IP — ads_user_access_logs, newest first, paged on
 * the server. No row checkboxes: audit logs are read-only and there is no
 * bulk action that makes sense on them (deleting them would defeat the point).
 */
function Logs() {
  const router = useRouter();
  const sp = useSearchParams();
  const kind = sp.get("kind") ?? "";
  const q = sp.get("q") ?? "";
  const size = SIZES.includes(Number(sp.get("size"))) ? Number(sp.get("size")) : 50;
  const page = Math.max(Number(sp.get("p")) || 1, 1);

  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [qInput, setQInput] = useState(q);

  const setParams = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || (k === "p" && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`/admin/logs${next.size ? "?" + next : ""}`);
  };

  useEffect(() => {
    const params = new URLSearchParams({ limit: String(size), offset: String((page - 1) * size) });
    if (kind) params.set("page", kind);
    if (q) params.set("q", q);
    setRows(null);
    setError("");
    fetch(`/api/admin/logs?${params}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `โหลดไม่ได้ (${r.status})`);
        setRows(j.logs);
        setTotal(j.total);
      })
      .catch((e: Error) => {
        setError(e.message);
        setRows([]);
      });
  }, [kind, q, size, page]);

  const pages = Math.max(Math.ceil(total / size), 1);
  const label = (p: string) => ACTION_TH[p] ?? p;

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader subtitle="Log การใช้งาน" />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            ประเภท
            <select className="input" value={kind} onChange={(e) => setParams({ kind: e.target.value, p: 1 })}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <form
            className="flex gap-2 items-end flex-1"
            onSubmit={(e) => { e.preventDefault(); setParams({ q: qInput.trim(), p: 1 }); }}
          >
            <label className="text-sm text-gray-700 flex flex-col gap-1 flex-1">
              ค้นหาชื่อผู้ใช้
              <input className="input" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="username" />
            </label>
            <button type="submit" className="bg-secondary text-white text-sm font-medium px-4 min-h-10 rounded-lg hover:bg-secondary-light">ค้นหา</button>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            โหลด log ไม่สำเร็จ
            <details className="mt-1 text-xs text-red-600"><summary className="cursor-pointer">รายละเอียด</summary>{error}</details>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {rows === null ? (
            <p className="px-6 py-10 text-center text-gray-400 text-sm">กำลังโหลด…</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-gray-400 text-sm">ไม่มี log ตามเงื่อนไขนี้</p>
          ) : (
            <>
              {/* desktop: table */}
              <table className="hidden md:table w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">เวลา</th>
                    <th className="px-4 py-3 font-medium">ผู้ใช้</th>
                    <th className="px-4 py-3 font-medium">การกระทำ / หน้า</th>
                    <th className="px-4 py-3 font-medium">IP</th>
                    <th className="px-4 py-3 font-medium">อุปกรณ์</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{dateTimeToDisplay(r.accessed_at)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-900">{r.username}</td>
                      <td className="px-4 py-2 text-xs text-gray-700">{label(r.page)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.ip_address || "—"}</td>
                      <td className="px-4 py-2 text-xs text-gray-400 max-w-xs truncate" title={r.user_agent ?? ""}>{r.user_agent || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* mobile: cards */}
              <ul className="md:hidden divide-y divide-gray-100">
                {rows.map((r) => (
                  <li key={r.id} className="px-4 py-3 text-sm space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-gray-900">{r.username}</span>
                      <span className="text-xs text-gray-500">{dateTimeToDisplay(r.accessed_at)}</span>
                    </div>
                    <div className="text-gray-700">{label(r.page)}</div>
                    <div className="font-mono text-xs text-gray-500">IP {r.ip_address || "—"}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
            <span>ทั้งหมด {total.toLocaleString()} รายการ</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                ต่อหน้า
                <select className="input py-1" value={size} onChange={(e) => setParams({ size: e.target.value, p: 1 })}>
                  {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <button aria-label="หน้าก่อนหน้า" disabled={page <= 1} onClick={() => setParams({ p: page - 1 })}
                className="min-w-10 min-h-10 rounded-lg border border-gray-200 disabled:opacity-40">‹</button>
              <span>{page} / {pages}</span>
              <button aria-label="หน้าถัดไป" disabled={page >= pages} onClick={() => setParams({ p: page + 1 })}
                className="min-w-10 min-h-10 rounded-lg border border-gray-200 disabled:opacity-40">›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
