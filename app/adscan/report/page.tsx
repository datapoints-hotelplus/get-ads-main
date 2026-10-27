"use client";

import { useEffect, useState } from "react";
import type { Report } from "@/lib/adscanReport";
import { thDate } from "../data";
import { card } from "../ui";

const COLS: { k: string; label: string; hint: string }[] = [
  { k: "received", label: "เรื่องที่ได้รับ", hint: "alert ในโรงแรมที่ดูแล ช่วงนี้" },
  { k: "handled", label: "จัดการแล้ว", hint: "บันทึก “แก้แล้ว” หรือ “ไม่แก้”" },
  { k: "pending", label: "ค้างอยู่", hint: "ยังเปิดอยู่และยังไม่มีใครบันทึก" },
  { k: "pendingDays", label: "ค้างเฉลี่ย (วัน)", hint: "อายุเฉลี่ยของเรื่องที่ค้าง" },
  { k: "daysToAct", label: "จัดการภายใน (วัน)", hint: "เฉลี่ยจากวันที่พบถึงวันที่บันทึก" },
  { k: "fixed", label: "แก้แล้ว", hint: "" },
  { k: "improvedRate", label: "แก้แล้วได้ผล", hint: "ตัวเลขกลับมาในเกณฑ์ ÷ เรื่องที่แก้และตัดสินผลได้แล้ว" },
  { k: "skipped", label: "ไม่แก้", hint: "" },
];

export default function PerformanceReport() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/adscan/report?days=${days}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.statusText);
        if (live) setData(j);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [days]);

  const cell = (row: Report["staff"][number], k: string) => {
    const v = row[k as keyof typeof row];
    if (v == null) return "—";
    if (k === "improvedRate") return `${v}% (${row.improved}/${row.improved + row.stillBad})`;
    return String(v);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Performance Report</h1>
          <div className="text-sm text-gray-500">
            การจัดการ Alert ของทีม Marcom · ไม่แสดงข้อมูลโฆษณา{data?.latestDate && ` · ข้อมูลโฆษณาล่าสุด ${thDate(data.latestDate)}`}
          </div>
        </div>
        <div role="group" aria-label="ช่วงเวลา" className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <button key={d} aria-pressed={days === d} onClick={() => { setDays(d); setData(null); setError(""); }}
              className={`px-3.5 min-h-9 rounded-full text-sm font-semibold border ${days === d ? "bg-secondary text-white border-secondary" : "bg-white border-gray-300"}`}>
              {d} วัน
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className={`${card} p-8 text-center text-red-700`}>โหลดไม่ได้: {error}</div>
      ) : !data ? (
        <div className={`${card} p-8 text-center text-gray-500`}>กำลังโหลด…</div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-indigo-100 text-xs">
              <tr>
                <th className="text-left px-4 py-2.5">พนักงาน</th>
                <th className="text-right px-3">โรงแรมที่ดูแล</th>
                {COLS.map((c) => <th key={c.k} className="text-right px-3" title={c.hint}>{c.label}</th>)}
                <th className="text-left px-3">เหตุผลที่ไม่แก้บ่อยสุด</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((s) => (
                <tr key={s.name} className="border-b border-gray-100">
                  <td className="px-4 py-3"><strong>{s.name}</strong> <span className="text-xs text-gray-500">{s.role}</span></td>
                  <td className="text-right px-3 font-mono">{s.hotels}</td>
                  {COLS.map((c) => (
                    <td key={c.k} className={`text-right px-3 font-mono tabular-nums ${c.k === "pending" && s.pending ? "text-red-700 font-bold" : ""}`}>{cell(s, c.k)}</td>
                  ))}
                  <td className="px-3 text-xs">{s.topSkip ?? "—"}</td>
                </tr>
              ))}
              {!data.staff.length && <tr><td colSpan={COLS.length + 3} className="px-4 py-8 text-center text-gray-500">ยังไม่มีพนักงาน role Specialist</td></tr>}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs text-gray-500 space-y-0.5">
            <div>ช่วงเวลานับจาก {thDate(data.since)} · ชี้ที่หัวคอลัมน์เพื่อดูความหมาย</div>
            <div>“ได้ผล” นับเมื่อตัวเลขของ Campaign กลับมาอยู่ในเกณฑ์จริงหลังบันทึกว่าแก้แล้ว</div>
          </div>
        </div>
      )}
    </div>
  );
}
