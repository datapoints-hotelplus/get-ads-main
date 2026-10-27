"use client";

import { useState } from "react";
import Link from "next/link";
import { FOLLOW_DAYS, followUps, thDate, useAdscan, type AdscanAlert, type AdscanPayload } from "./data";
import { ADS_MANAGER, Aging, Chip, DataNote, Gate, Metric, SEV, Sparkline, card, costText, hotelPill, strip } from "./ui";

function IssueCard({ a, n }: { a: AdscanAlert; n: number }) {
  return (
    <article className={`${card} ${SEV[a.sev].border} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-6 h-6 rounded-full bg-secondary text-white text-xs font-bold flex items-center justify-center">{n}</span>
          <span className={hotelPill}>{a.hotel}</span>
          <span className="text-gray-500 text-xs">Campaign: <span className="font-mono text-gray-900">{a.campaign}</span></span>
        </div>
        <span className="flex items-center gap-2"><Aging a={a} /><Chip sev={a.sev} /></span>
      </div>
      <div className="font-semibold text-gray-900">{a.headline}</div>
      <div className="flex flex-wrap gap-2">
        {strip(a).map((m) => <Metric key={m.k} {...m} />)}
        <div className="flex-1 min-w-[140px] bg-gray-50 rounded-md px-2.5 py-2">
          <div className="text-[11px] font-semibold tracking-wide text-gray-500">14 วันล่าสุด</div>
          <Sparkline a={a} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3">
        <div className="flex-[1_1_280px] text-sm"><strong className="text-secondary">ต้องทำ:</strong> {a.action}</div>
        <div className="flex gap-2">
          <a href={ADS_MANAGER} target="_blank" rel="noopener" className="px-3 py-2 rounded-lg border border-secondary text-secondary text-sm font-semibold">Ads Manager ↗</a>
          <Link href={`/adscan/${a.id}`} className="px-3 py-2 rounded-lg bg-secondary text-white text-sm font-semibold">ดูรายละเอียด</Link>
        </div>
      </div>
    </article>
  );
}

function Today({ d }: { d: AdscanPayload }) {
  const [filter, setFilter] = useState("all");
  const [allGood, setAllGood] = useState(false);
  const open = d.alerts.filter((a) => a.kind === "issue" && a.status === "open");
  const shown = filter === "all" ? open : open.filter((a) => a.hotelId === filter);
  const good = d.alerts.filter((a) => a.kind === "good");
  const waits = d.alerts.filter((a) => a.kind === "wait");
  const follows = followUps(d);
  const crit = open.filter((a) => a.sev === "critical").length;
  const issueHotels = d.hotels.filter((h) => open.some((a) => a.hotelId === h.id));

  const kpis = [
    { label: "ต้องแก้", value: open.length, sub: `เร่งด่วน ${crit} · ปานกลาง ${open.length - crit}` },
    { label: "ข่าวดี", value: good.length, sub: "Campaign ที่ถูกกว่าเกณฑ์ ≥ 30%" },
    { label: "กำลังติดตามผล", value: follows.length, sub: `แก้แล้วใน ${FOLLOW_DAYS} วันที่ผ่านมา` },
    { label: "โรงแรมที่ดูแล", value: d.hotels.length, sub: `มีเรื่องต้องแก้ ${issueHotels.length} โรงแรม` },
  ];

  return (
    <div className="space-y-5">
      <div>
        <DataNote d={d} />
        <h1 className="text-2xl font-bold text-gray-900">{open.length ? `มี ${open.length} เรื่องต้องแก้` : "ไม่มีเรื่องต้องแก้"}</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${card} px-4 py-3`}>
            <div className="text-[11px] font-semibold tracking-wide text-gray-500">{k.label}</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900">{k.value}</div>
            <div className="text-xs text-gray-500">{k.sub}</div>
          </div>
        ))}
      </div>

      {issueHotels.length > 1 && (
        <div role="group" aria-label="กรองตามโรงแรม" className="flex flex-wrap gap-2">
          {[{ id: "all", name: "ทุกโรงแรม" }, ...issueHotels].map((f) => {
            const count = f.id === "all" ? open.length : open.filter((a) => a.hotelId === f.id).length;
            const active = filter === f.id;
            return (
              <button key={f.id} aria-pressed={active} onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-2 min-h-9 px-3.5 rounded-full text-sm font-semibold border ${active ? "bg-secondary text-white border-secondary ring-2 ring-primary" : "bg-white text-gray-900 border-gray-300"}`}>
                {f.name}
                <span className="min-w-5 px-1.5 rounded-full text-[11px] leading-[18px] bg-red-600 text-white">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-5 items-start">
        <section aria-label="เรื่องที่ต้องแก้" className="flex-[3_1_560px] min-w-0 space-y-3">
          <h2 className="font-semibold text-gray-900">ต้องแก้ — เรียงตามความเร่งด่วน แล้วตามงบ</h2>
          {shown.map((a, i) => <IssueCard key={a.id} a={a} n={i + 1} />)}
          {!shown.length && (
            <div className={`${card} p-7 text-center`}>
              <div className="font-semibold">ไม่มีเรื่องค้าง</div>
              <div className="text-sm text-gray-500">ทุก Campaign ที่ตรวจได้อยู่ในเกณฑ์ หรือบันทึกแล้ว</div>
            </div>
          )}
        </section>

        <aside className="flex-[2_1_320px] min-w-0 space-y-5">
          <section className="space-y-2.5">
            <h2 className="font-semibold text-gray-900">ข่าวดี</h2>
            {(allGood ? good : good.slice(0, 5)).map((g) => (
              <Link key={g.id} href={`/adscan/${g.id}`} className={`${card} ${SEV.good.border} p-3.5 block space-y-1 hover:bg-gray-50`}>
                <div className="flex justify-between gap-2 flex-wrap"><span className={hotelPill}>{g.hotel}</span><span className="font-mono text-sm font-bold text-teal-700">{costText(g)}</span></div>
                <div className="text-sm font-semibold">{g.headline}</div>
                <div className="text-xs text-gray-500 font-mono truncate">{g.campaign}</div>
              </Link>
            ))}
            {good.length > 5 && (
              <button onClick={() => setAllGood(!allGood)} className="text-sm font-semibold text-secondary">
                {allGood ? "แสดงน้อยลง" : `ดูทั้งหมด ${good.length} เรื่อง`}
              </button>
            )}
            {!good.length && <div className="text-sm text-gray-500">ยังไม่มี</div>}
          </section>

          <section className="space-y-2.5">
            <h2 className="font-semibold text-gray-900">ติดตามผล</h2>
            {follows.map((f) => (
              <div key={f.act.id} className={`${card} px-3.5 py-3 space-y-1`}>
                <div className="flex justify-between gap-2"><strong className="text-sm">{f.alert?.hotel ?? "—"}</strong><span className="text-xs text-gray-500">{thDate(f.act.created_at.slice(0, 10))} · {f.act.by}</span></div>
                <div className="text-sm">{f.act.label} · <span className="font-mono text-xs">{f.alert?.campaign ?? f.act.campaign_id}</span></div>
                <Chip sev={f.sev}>{f.result}</Chip>
              </div>
            ))}
            {!follows.length && <div className="text-sm text-gray-500">ยังไม่มีเรื่องที่บันทึกว่าแก้แล้ว</div>}
          </section>

          <section className="space-y-2.5">
            <h2 className="font-semibold text-gray-900">รอข้อมูล</h2>
            {waits.map((w) => (
              <div key={w.id} className={`${card} px-3.5 py-3 space-y-1.5 bg-gray-50`}>
                <div className="flex justify-between gap-2"><strong className="text-sm">{w.hotel}</strong><Chip sev="wait" /></div>
                <div className="text-sm text-gray-500"><span className="font-mono">{w.campaign}</span> — {w.headline}</div>
              </div>
            ))}
            {!waits.length && <div className="text-sm text-gray-500">ไม่มี</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function AdscanToday() {
  const { data, error } = useAdscan();
  return <Gate data={data} error={error}>{(d) => <Today d={d} />}</Gate>;
}
