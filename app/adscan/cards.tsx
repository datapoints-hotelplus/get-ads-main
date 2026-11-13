"use client";

import Link from "next/link";
import { followUps, thDate, type AdscanAlert, type AdscanPayload } from "./data";
import { ADS_MANAGER, Aging, Chip, Metric, SEV, Sparkline, card, costText, hotelPill, strip } from "./ui";

/** The four lists of the ADSCAN overview — one definition for the dashboard and /adscan/list. */
export function adscanLists(d: AdscanPayload) {
  const follow = followUps(d).filter((f) => !f.improved); // back within the threshold → done, off the list
  return {
    // Red must be answered (fixed / skipped); answered ones come back after FOLLOW_DAYS if still red.
    issue: d.alerts.filter((a) => a.sev === "critical" && a.status === "open"),
    watch: d.alerts.filter((a) => a.sev === "medium"), // yellow: for awareness only, no fixed / skipped
    good: d.alerts.filter((a) => a.kind === "good"),
    follow,
  };
}
export type FollowItem = ReturnType<typeof adscanLists>["follow"][number];

export const LIST_TABS = [
  { k: "issue", label: "ต้องแก้ (แดง)" },
  { k: "watch", label: "ควรเฝ้าดู (เหลือง)" },
  { k: "good", label: "ข่าวดี" },
  { k: "follow", label: "ติดตามผล" },
] as const;
export type ListTab = (typeof LIST_TABS)[number]["k"];

export function IssueCard({ a, n, readOnly }: { a: AdscanAlert; n: number; readOnly?: boolean }) {
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
        {!readOnly && (
          <div className="flex gap-2">
            <a href={ADS_MANAGER} target="_blank" rel="noopener" className="px-3 py-2 rounded-lg border border-secondary text-secondary text-sm font-semibold">Ads Manager ↗</a>
            <Link href={`/adscan/${a.id}`} className="px-3 py-2 rounded-lg bg-secondary text-white text-sm font-semibold">ดูรายละเอียด</Link>
          </div>
        )}
      </div>
    </article>
  );
}

/** Small card for good news / yellow: a link to the detail page, or a plain box for view-only HR. */
export function SmallAlertCard({ a, readOnly }: { a: AdscanAlert; readOnly?: boolean }) {
  const sev = a.kind === "good" ? "good" : "medium";
  const cls = `${card} ${SEV[sev].border} p-3.5 block space-y-1`;
  const body = (
    <>
      <div className="flex justify-between gap-2 flex-wrap">
        <span className={hotelPill}>{a.hotel}</span>
        <span className={`font-mono text-sm font-bold ${sev === "good" ? "text-teal-700" : "text-amber-800"}`}>{costText(a)}</span>
      </div>
      <div className="text-sm font-semibold">{a.headline}</div>
      <div className="text-xs text-gray-500 font-mono truncate" title={a.campaign}>{a.campaign}</div>
    </>
  );
  return readOnly ? <div className={cls}>{body}</div> : <Link href={`/adscan/${a.id}`} className={`${cls} hover:bg-gray-50`}>{body}</Link>;
}

export function FollowCard({ f }: { f: FollowItem }) {
  return (
    <div className={`${card} px-3.5 py-3 space-y-1`}>
      <div className="flex justify-between gap-2"><strong className="text-sm">{f.alert?.hotel ?? "—"}</strong><span className="text-xs text-gray-500">{thDate(f.act.created_at.slice(0, 10))} · {f.act.by}</span></div>
      <div className="text-sm">{f.act.label} · <span className="font-mono text-xs">{f.alert?.campaign ?? f.act.campaign_id}</span></div>
      <Chip sev={f.sev}>{f.result}</Chip>
    </div>
  );
}
