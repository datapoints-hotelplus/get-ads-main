"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { hotelName, useAdscan, type AdscanPayload } from "../../data";
import { Chip, DataNote, Gate, Metric, SEV, card, strip } from "../../ui";

function Hotel({ d, id }: { d: AdscanPayload; id: string }) {
  if (!d.hotels.some((h) => h.id === id))
    return <div className={`${card} p-8 text-center`}>ไม่พบโรงแรมนี้ในโรงแรมที่คุณดูแล · <Link href="/adscan/hotels" className="text-secondary font-semibold">กลับ</Link></div>;
  const mine = d.alerts.filter((a) => a.hotelId === id);
  return (
    <div className="space-y-4">
      <DataNote d={d} />
      <Link href="/adscan/hotels" className="text-sm font-semibold text-secondary">‹ โรงแรมของฉัน</Link>
      <h1 className="text-2xl font-bold">{hotelName(d, id)}</h1>
      {mine.map((a) => {
        const closed = a.kind === "issue" && a.status !== "open";
        return (
          <div key={a.id} className={`${card} ${closed ? "" : SEV[a.sev].border} p-4 flex flex-wrap items-center gap-4`}>
            <div className="flex-[1_1_360px] min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {closed ? <Chip sev="follow">{a.status === "fixed" ? "กำลังติดตามผล" : "ไม่แก้"}</Chip> : <Chip sev={a.sev} />}
                <strong className="font-mono">{a.campaign}</strong>
                <span className="text-xs text-gray-500">{a.template}</span>
              </div>
              <div className="flex flex-wrap gap-2">{strip(a).map((m) => <Metric key={m.k} {...m} />)}</div>
              <div className="text-sm">{a.headline}</div>
            </div>
            {(a.kind === "issue" || a.kind === "good") && (
              <Link href={`/adscan/${a.id}`} className="px-3 py-2 rounded-lg bg-secondary text-white text-sm font-semibold">ดูรายละเอียด</Link>
            )}
          </div>
        );
      })}
      {!mine.length && <div className={`${card} p-8 text-center text-gray-500`}>ไม่มี Campaign ที่ตรวจได้ใน 7 วันล่าสุด</div>}
    </div>
  );
}

export default function AdscanHotel() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useAdscan();
  return <Gate data={data} error={error}>{(d) => <Hotel d={d} id={decodeURIComponent(id)} />}</Gate>;
}
