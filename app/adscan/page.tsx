"use client";

import { useState } from "react";
import Link from "next/link";
import { FOLLOW_DAYS, useAdscan, type AdscanAlert, type AdscanPayload } from "./data";
import { DataNote, Gate, card } from "./ui";
import { FollowCard, IssueCard, SmallAlertCard, adscanLists, type ListTab } from "./cards";

const PREVIEW = 3; // side lists show this many; the rest is on /adscan/list
const listHref = (tab: ListTab) => `/adscan/list?tab=${tab}`;

function SeeAll({ tab, total }: { tab: ListTab; total: number }) {
  return total > PREVIEW ? <Link href={listHref(tab)} className="inline-block text-sm font-semibold text-secondary">ดูทั้งหมด {total} เรื่อง ›</Link> : null;
}

function Today({ d }: { d: AdscanPayload }) {
  const [filter, setFilter] = useState("all");
  const { issue: open, watch, good, follow: follows } = adscanLists(d);
  const byHotel = <T extends AdscanAlert>(xs: T[]) => (filter === "all" ? xs : xs.filter((a) => a.hotelId === filter));
  const shown = byHotel(open);
  const watchShown = byHotel(watch);
  const issueHotels = d.hotels.filter((h) => open.some((a) => a.hotelId === h.id) || watch.some((a) => a.hotelId === h.id));

  // HR may not open /adscan/hotels, so that card is not a link for them.
  const kpis: { label: string; value: number; sub: string; href: string | null; tone?: string }[] = [
    { label: "ต้องแก้ (แดง)", value: open.length, sub: "ต้องบันทึกว่าแก้ / ไม่แก้", href: listHref("issue"), tone: "text-red-700" },
    { label: "ควรเฝ้าดู (เหลือง)", value: watch.length, sub: "ไม่ต้องบันทึก", href: listHref("watch"), tone: "text-amber-800" },
    { label: "ข่าวดี", value: good.length, sub: "Campaign ที่ถูกกว่าเกณฑ์ ≥ 30%", href: listHref("good") },
    { label: "กำลังติดตามผล", value: follows.length, sub: `แก้แล้วใน ${FOLLOW_DAYS} วันที่ผ่านมา`, href: listHref("follow") },
    { label: "โรงแรมที่ดูแล", value: d.hotels.length, sub: `มีเรื่องแดง/เหลือง ${issueHotels.length} โรงแรม`, href: d.readOnly ? null : "/adscan/hotels" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <DataNote d={d} />
        <h1 className="text-2xl font-bold text-gray-900">{open.length ? `มี ${open.length} เรื่องต้องแก้` : "ไม่มีเรื่องต้องแก้"}</h1>
        {watch.length > 0 && <div className="text-sm text-gray-500">และอีก {watch.length} เรื่องควรเฝ้าดู (เหลือง) ไม่ต้องบันทึกว่าแก้/ไม่แก้</div>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((k) => {
          const inner = (
            <>
              <div className="text-[11px] font-semibold tracking-wide text-gray-500">{k.label}</div>
              <div className={`text-2xl font-bold font-mono tabular-nums ${k.tone ?? "text-gray-900"}`}>{k.value}</div>
              <div className="text-xs text-gray-500">{k.sub}</div>
            </>
          );
          return k.href
            ? <Link key={k.label} href={k.href} className={`${card} px-4 py-3 block hover:bg-gray-50`}>{inner}</Link>
            : <div key={k.label} className={`${card} px-4 py-3`}>{inner}</div>;
        })}
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
                {count > 0 && <span className="min-w-5 px-1.5 rounded-full text-[11px] leading-[18px] bg-red-600 text-white">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-5 items-start">
        <section aria-label="เรื่องที่ต้องแก้" className="flex-[3_1_560px] min-w-0 space-y-3">
          <h2 className="font-semibold text-gray-900">ต้องแก้ — เรียงตามความเร่งด่วน แล้วตามงบ</h2>
          {shown.map((a, i) => <IssueCard key={a.id} a={a} n={i + 1} readOnly={d.readOnly} />)}
          {!shown.length && (
            <div className={`${card} p-7 text-center`}>
              <div className="font-semibold">ไม่มีเรื่องค้าง</div>
              <div className="text-sm text-gray-500">ไม่มี Campaign ที่เกินเกณฑ์แดง หรือบันทึกครบแล้ว</div>
            </div>
          )}

          {watchShown.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <h2 className="font-semibold text-gray-900">ควรเฝ้าดู (เหลือง) — ไม่ต้องบันทึกว่าแก้/ไม่แก้</h2>
              {watchShown.slice(0, PREVIEW).map((w) => <SmallAlertCard key={w.id} a={w} readOnly={d.readOnly} />)}
              <SeeAll tab="watch" total={watchShown.length} />
            </div>
          )}
        </section>

        <aside className="flex-[2_1_320px] min-w-0 space-y-5">
          <section className="space-y-2.5">
            <h2 className="font-semibold text-gray-900">ข่าวดี</h2>
            {good.slice(0, PREVIEW).map((g) => <SmallAlertCard key={g.id} a={g} readOnly={d.readOnly} />)}
            <SeeAll tab="good" total={good.length} />
            {!good.length && <div className="text-sm text-gray-500">ยังไม่มี</div>}
          </section>

          <section className="space-y-2.5">
            <h2 className="font-semibold text-gray-900">ติดตามผล</h2>
            {follows.slice(0, PREVIEW).map((f) => <FollowCard key={f.act.id} f={f} />)}
            <SeeAll tab="follow" total={follows.length} />
            {!follows.length && <div className="text-sm text-gray-500">ไม่มีเรื่องที่กำลังติดตามผล</div>}
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
