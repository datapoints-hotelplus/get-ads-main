"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdscan, type AdscanPayload } from "../data";
import { DataNote, Gate, card } from "../ui";
import { FollowCard, IssueCard, LIST_TABS, SmallAlertCard, adscanLists, type ListTab } from "../cards";

const SIZES = [10, 25, 50];

export default function AdscanListPage() {
  const { data, error } = useAdscan();
  return (
    <Suspense>
      <Gate data={data} error={error}>{(d) => <AdscanList d={d} />}</Gate>
    </Suspense>
  );
}

/**
 * Every item of one ADSCAN list (ต้องแก้ / ควรเฝ้าดู / ข่าวดี / ติดตามผล) — the dashboard shows
 * only the first few. Tab, search, hotel and page live in the URL so a link opens the same view.
 * Paged on the client: the whole payload is already loaded by /api/adscan.
 * No row checkboxes / bulk actions: แก้แล้ว / ไม่แก้ needs a reason per campaign (business rule),
 * and the other lists are view-only.
 */
function AdscanList({ d }: { d: AdscanPayload }) {
  const router = useRouter();
  const sp = useSearchParams();
  const tab: ListTab = LIST_TABS.some((t) => t.k === sp.get("tab")) ? (sp.get("tab") as ListTab) : "issue";
  const q = sp.get("q") ?? "";
  const hotel = sp.get("hotel") ?? "";
  const size = SIZES.includes(Number(sp.get("size"))) ? Number(sp.get("size")) : 10;
  const [qInput, setQInput] = useState(q);

  const setParams = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || (k === "p" && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`/adscan/list${next.size ? "?" + next : ""}`);
  };

  const lists = adscanLists(d);
  const needle = q.trim().toLowerCase();
  const hit = (hotelId: string | undefined, ...texts: (string | undefined)[]) =>
    (!hotel || hotelId === hotel) && (!needle || texts.some((t) => t?.toLowerCase().includes(needle)));
  const alerts = tab === "follow" ? [] : lists[tab].filter((a) => hit(a.hotelId, a.hotel, a.campaign));
  const follows = tab === "follow" ? lists.follow.filter((f) => hit(f.alert?.hotelId ?? f.act.account_id, f.alert?.hotel, f.alert?.campaign, f.act.label)) : [];
  const total = tab === "follow" ? follows.length : alerts.length;
  const pages = Math.max(Math.ceil(total / size), 1);
  const page = Math.min(Math.max(Number(sp.get("p")) || 1, 1), pages);
  const from = (page - 1) * size;

  return (
    <div className="space-y-4">
      <div>
        <DataNote d={d} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/adscan" className="font-semibold text-secondary">‹ งานของฉัน</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">รวมทุกเรื่อง</h1>
      </div>

      <div role="tablist" aria-label="ประเภทเรื่อง" className="flex flex-wrap gap-2">
        {LIST_TABS.map((t) => {
          const active = t.k === tab;
          return (
            <button key={t.k} role="tab" aria-selected={active} onClick={() => setParams({ tab: t.k, p: 1 })}
              className={`inline-flex items-center gap-2 min-h-10 px-3.5 rounded-full text-sm font-semibold border ${active ? "bg-secondary text-white border-secondary ring-2 ring-primary" : "bg-white text-gray-900 border-gray-300"}`}>
              {t.label}
              <span className={`min-w-5 px-1.5 rounded-full text-[11px] leading-[18px] ${active ? "bg-white text-secondary" : "bg-gray-100 text-gray-700"}`}>{lists[t.k].length}</span>
            </button>
          );
        })}
      </div>

      <div className={`${card} p-4 flex flex-col gap-3 sm:flex-row sm:items-end`}>
        <label className="text-sm text-gray-700 flex flex-col gap-1">
          โรงแรม
          <select className="input" value={hotel} onChange={(e) => setParams({ hotel: e.target.value, p: 1 })}>
            <option value="">ทุกโรงแรม</option>
            {d.hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <form className="flex gap-2 items-end flex-1" onSubmit={(e) => { e.preventDefault(); setParams({ q: qInput.trim(), p: 1 }); }}>
          <label className="text-sm text-gray-700 flex flex-col gap-1 flex-1">
            ค้นหา
            <input className="input" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="ชื่อโรงแรม หรือ Campaign" />
          </label>
          <button type="submit" className="bg-secondary text-white text-sm font-medium px-4 min-h-10 rounded-lg hover:bg-secondary-light">ค้นหา</button>
        </form>
      </div>

      <div className="space-y-3">
        {tab === "issue" && alerts.slice(from, from + size).map((a, i) => <IssueCard key={a.id} a={a} n={from + i + 1} readOnly={d.readOnly} />)}
        {(tab === "watch" || tab === "good") && (
          <div className="grid gap-3 md:grid-cols-2">
            {alerts.slice(from, from + size).map((a) => <SmallAlertCard key={a.id} a={a} readOnly={d.readOnly} />)}
          </div>
        )}
        {tab === "follow" && (
          <div className="grid gap-3 md:grid-cols-2">
            {follows.slice(from, from + size).map((f) => <FollowCard key={f.act.id} f={f} />)}
          </div>
        )}
        {!total && <div className={`${card} p-8 text-center text-sm text-gray-500`}>ไม่มีเรื่องตามเงื่อนไขนี้</div>}
      </div>

      <div className={`${card} flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-gray-600`}>
        <span>ทั้งหมด {total.toLocaleString()} เรื่อง</span>
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
  );
}
