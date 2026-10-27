"use client";

import Link from "next/link";
import type { Sev } from "@/lib/adscan";
import { WINDOW, money, useAdscan, type AdscanPayload } from "../data";
import { Chip, DataNote, Gate, SEV, card } from "../ui";

const ORDER: Record<Sev, number> = { critical: 0, medium: 1, good: 2, wait: 3, ok: 4, follow: 5 };

function Hotels({ d }: { d: AdscanPayload }) {
  const rows = d.hotels.map((h) => {
    const mine = d.alerts.filter((a) => a.hotelId === h.id);
    const open = mine.filter((a) => a.kind === "issue" && a.status === "open");
    const sev: Sev = open[0]?.sev ?? (mine.some((a) => a.kind === "good") ? "good" : mine.length ? (mine.every((a) => a.kind === "wait") ? "wait" : "ok") : "ok");
    return { ...h, mine, open, sev, spend: mine.reduce((s, a) => s + a.spend, 0) };
  }).sort((a, b) => ORDER[a.sev] - ORDER[b.sev] || b.spend - a.spend);

  return (
    <div className="space-y-4">
      <div>
        <DataNote d={d} />
        <h1 className="text-2xl font-bold">โรงแรมของฉัน</h1>
        <div className="text-sm text-gray-500">{d.hotels.length} โรงแรม · เรียงจากเรื่องที่ด่วนที่สุด · Spend รวมของ Campaign ที่ตรวจได้ {WINDOW} วันล่าสุด</div>
      </div>
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {rows.map((h) => (
          <div key={h.id} className={`${card} ${SEV[h.sev].border} p-4 space-y-3`}>
            <div className="flex justify-between gap-2 flex-wrap"><strong className="text-lg">{h.name}</strong><Chip sev={h.sev} /></div>
            <div className="text-sm text-gray-500">
              {h.open[0]?.headline ?? (h.mine.length ? `ตรวจได้ ${h.mine.length} Campaign ไม่มีเรื่องค้าง` : "ไม่มี Campaign ที่ตรวจได้ (ต้องขึ้นต้นด้วยรหัสใน Portfolio Template เช่น MES, PL, ENG)")}
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-sm">
              {[["SPEND", money(h.spend, 0)], ["CAMPAIGN", h.mine.length], ["เรื่องค้าง", h.open.length]].map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-md px-2 py-1.5">
                  <div className="text-[11px] font-semibold text-gray-500">{k}</div>
                  <div className="font-mono font-semibold">{v}</div>
                </div>
              ))}
            </div>
            {h.mine.length > 0 && (
              <Link href={`/adscan/hotels/${encodeURIComponent(h.id)}`} className="inline-block px-3 py-2 rounded-lg border border-secondary text-secondary text-sm font-semibold">ดู Campaign</Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdscanHotels() {
  const { data, error } = useAdscan();
  return <Gate data={data} error={error}>{(d) => <Hotels d={d} />}</Gate>;
}
