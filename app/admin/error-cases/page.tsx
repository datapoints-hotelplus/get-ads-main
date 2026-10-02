"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type LogRow = { endpoint: string; http_status: number; error_message: string; at: string };

function Section({
  id,
  title,
  trigger,
  note,
  real,
  children,
}: {
  id: string;
  title: string;
  trigger: string;
  note: string;
  real: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow p-6 space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-mono text-gray-400">{id}</span>
        <h2 className="font-semibold text-gray-800">{title}</h2>
      </div>
      <p className="text-xs text-gray-500">Trigger: {trigger}</p>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-gray-700 space-y-1">
        <p><span className="font-semibold text-blue-700">ปุ่มด้านล่างทำอะไร:</span> {note}</p>
        <p><span className="font-semibold text-blue-700">ของจริงเกิดยังไง:</span> {real}</p>
      </div>
      <div className="pt-2 border-t border-gray-100">{children}</div>
    </div>
  );
}

export default function ErrorCasesPage() {
  const router = useRouter();

  // F23 — disconnected modal
  const [f23Disconnected, setF23Disconnected] = useState(false);

  // F24 — retry with exponential backoff
  const [f24Attempt, setF24Attempt] = useState(0);
  const [f24Status, setF24Status] = useState<"idle" | "retrying" | "failed">("idle");

  // F25 — cached fallback
  const [f25ShowCached, setF25ShowCached] = useState(false);

  // F26 — email alert
  const [f26Fails, setF26Fails] = useState(0);
  const [f26Sending, setF26Sending] = useState(false);
  const [f26Sent, setF26Sent] = useState<string | null>(null);

  // F27 — error log
  const [f27Log, setF27Log] = useState<LogRow[]>([]);

  useEffect(() => {
    fetch("/api/admin/logs?limit=1").then((r) => {
      if (r.status === 401) router.push("/admin/login");
    });
  }, [router]);

  async function runF24() {
    setF24Status("retrying");
    for (let i = 1; i <= 3; i++) {
      setF24Attempt(i);
      await new Promise((r) => setTimeout(r, 500 * 2 ** (i - 1))); // 500ms, 1s, 2s
    }
    setF24Status("failed");
  }

  function simulateF26Fail() {
    const next = f26Fails + 1;
    setF26Fails(next);
    setF27Log((log) => [
      { endpoint: "/api/tiktok/sync", http_status: 500, error_message: "simulated failure", at: new Date().toISOString() },
      ...log,
    ]);
  }

  async function sendRealTestEmail() {
    setF26Sending(true);
    setF26Sent(null);
    try {
      const r = await fetch("/api/admin/error-cases/test-email", { method: "POST" });
      setF26Sent(r.ok ? "sent — check admin inbox" : `failed (${r.status})`);
    } catch {
      setF26Sent("failed (network error)");
    } finally {
      setF26Sending(false);
    }
  }

  function simulateF27Error() {
    setF27Log((log) => [
      {
        endpoint: "/api/tiktok/sync-account-totals",
        http_status: [401, 429, 500][Math.floor(Math.random() * 3)],
        error_message: "simulated API error",
        at: new Date().toISOString(),
      },
      ...log,
    ]);
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-800">1.5 Error Handling & Resilience — test page</h1>
        <p className="text-sm text-gray-500">Click each trigger to preview the corresponding F23–F27 behavior.</p>
      </div>

      <Section
        id="F23"
        title="API Disconnected banner"
        trigger="API call returns 401 / token expired"
        note="แค่เปิด modal นี้ขึ้นมาโชว์ — ไม่เช็ค token จริง ไม่ยิง API"
        real="TikTok token หมดอายุ/ถูก revoke → /api/tiktok/status บอกว่า disconnected → หน้า /tiktok/dashboard เช็คตอนโหลดหน้า แล้วเปิด modal นี้บล็อกจอ ปิดปุ่ม Sync Now จนกว่าจะไป re-authenticate ที่ /tiktok/sync"
      >
        <button
          onClick={() => setF23Disconnected(true)}
          className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
        >
          Simulate 401
        </button>
        {f23Disconnected && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
              <p className="text-red-700 font-semibold mb-2">⚠ API Disconnected</p>
              <p className="text-sm text-gray-700 mb-5">
                กรุณา re-authenticate — token ใช้ไม่ได้แล้ว
              </p>
              <button disabled className="px-4 py-2 rounded-lg bg-gray-300 text-gray-500 text-sm mb-2 w-full cursor-not-allowed">
                Sync Now (disabled)
              </button>
              <button
                onClick={() => setF23Disconnected(false)}
                className="text-xs text-gray-400 underline"
              >
                close preview
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section
        id="F24"
        title="Retry 3x with exponential backoff"
        trigger="API call fails"
        note="นับ attempt 1→3 ด้วย setTimeout (500ms, 1s, 2s) — ไม่ได้ยิง API จริง แค่จำลองจังหวะเวลา"
        real="ตอน sync เรียก TikTok/Windsor API แล้ว fail (timeout, 5xx) → retry เองสูงสุด 3 ครั้ง ก่อนถือว่า sync attempt นั้นล้มเหลว แล้วบันทึกลง tiktok_sync_log (status=fail)"
      >
        <button
          onClick={runF24}
          disabled={f24Status === "retrying"}
          className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
        >
          Simulate API failure
        </button>
        {f24Status !== "idle" && (
          <p className="text-sm text-gray-600 mt-2">
            {f24Status === "retrying" ? `retrying… attempt ${f24Attempt}/3` : "3 retries exhausted → sync marked failed"}
          </p>
        )}
      </Section>

      <Section
        id="F25"
        title="Cached data + timestamp label"
        trigger="Sync fails after 3 retries — never show an empty dashboard"
        note="โชว์ card ตัวเลขปลอมพร้อม label 'ข้อมูล ณ ...' — เลขมั่ว ไม่ได้ดึงจาก DB จริง"
        real="sync fail ครบ 3 retry แล้ว dashboard ไม่โชว์ว่างเปล่า ยัง render ข้อมูลล่าสุดที่ sync สำเร็จครั้งก่อนจาก DB พร้อม timestamp กำกับ (ของจริงคือ asOf ใน HeroSpend component)"
      >
        <button
          onClick={() => setF25ShowCached(true)}
          className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700"
        >
          Simulate exhausted retries
        </button>
        {f25ShowCached && (
          <div className="mt-3 bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-white/50 mb-1" style={{ color: "#888" }}>Total Spend · this month</p>
            <p className="text-2xl font-bold text-gray-800">฿123,456</p>
            <p className="text-xs text-amber-600 mt-1">ข้อมูล ณ {new Date().toLocaleString("th-TH")} (cached — sync failed)</p>
          </div>
        )}
      </Section>

      <Section
        id="F26"
        title="Email alert on 2+ consecutive failures"
        trigger="Consecutive sync failures > 2"
        note="ปุ่มบน: +1 counter ในหน้าเฉยๆ ไม่เขียน DB. ปุ่มล่าง 'Send real test email' ยิงจริงผ่าน Resend (lib/email.ts) ไปหา recipient ใน tiktok_alert_settings"
        real="ทุกครั้ง sync จบ ระบบเช็ค tiktok_sync_log ว่า fail ติดกันกี่ครั้ง (checkConsecutiveFailures) เกิน 2 ครั้ง → ส่ง alert email อัตโนมัติ ไม่ต้องกดเอง"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={simulateF26Fail}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
          >
            Simulate one failed sync
          </button>
          <span className="text-sm text-gray-600">consecutive fails: {f26Fails}</span>
        </div>
        {f26Fails > 2 && (
          <p className="text-sm text-green-700 mt-2">✉ would send alert email to admin (threshold reached)</p>
        )}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={sendRealTestEmail}
            disabled={f26Sending}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {f26Sending ? "sending…" : "Send real test email (Resend)"}
          </button>
          {f26Sent && <span className="ml-3 text-sm text-gray-600">{f26Sent}</span>}
        </div>
      </Section>

      <Section
        id="F27"
        title="Error log: endpoint, HTTP status, timestamp"
        trigger="Every API error"
        note="เติมแถวสุ่ม (endpoint/status/timestamp) ใน table ที่หน้าเว็บ (client state) — ไม่เขียนลง DB จริง"
        real="ทุก API call ที่ error จริง → insert แถวลงตาราง tiktok_error_log (endpoint, http_status, error_message, created_at) — ดูของจริงได้จาก DB โดยตรง"
      >
        <button
          onClick={simulateF27Error}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-800"
        >
          Simulate API error
        </button>
        {f27Log.length > 0 && (
          <table className="w-full text-xs mt-3">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="pb-1">endpoint</th>
                <th className="pb-1">status</th>
                <th className="pb-1">time</th>
              </tr>
            </thead>
            <tbody>
              {f27Log.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 font-mono">{row.endpoint}</td>
                  <td className="py-1">{row.http_status}</td>
                  <td className="py-1">{row.at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
