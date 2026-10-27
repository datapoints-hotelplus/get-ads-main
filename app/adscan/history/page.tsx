"use client";

import Link from "next/link";
import { followUps, hotelName, thDate, useAdscan, type AdscanPayload } from "../data";
import { Chip, DataNote, Gate, card } from "../ui";

function History({ d }: { d: AdscanPayload }) {
  const follow = new Map(followUps(d).map((f) => [f.act.id, f]));
  const grid = "grid grid-cols-[90px_minmax(0,1.2fr)_minmax(0,2fr)_110px_190px] gap-3 px-4 items-center";
  return (
    <div className="space-y-4">
      <div>
        <DataNote d={d} />
        <h1 className="text-2xl font-bold">ประวัติ</h1>
        <div className="text-sm text-gray-500">สิ่งที่ทีมบันทึกไว้ใน 90 วันที่ผ่านมา (เฉพาะโรงแรมที่คุณดูแล)</div>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <div className="min-w-[760px]">
          <div className={`${grid} py-2.5 bg-indigo-100 text-xs font-bold`}><span>วันที่</span><span>โรงแรม</span><span>สิ่งที่ทำ</span><span>โดย</span><span>ผล</span></div>
          {d.actions.map((x) => {
            const alert = d.alerts.find((a) => a.id === x.campaign_id);
            const f = follow.get(x.id);
            return (
              <div key={x.id} className={`${grid} py-3 border-b border-gray-100`}>
                <span className="font-mono text-sm text-gray-500">{thDate(x.created_at.slice(0, 10))}</span>
                <strong className="text-sm">{hotelName(d, x.account_id)}</strong>
                <span className="flex flex-col min-w-0">
                  <span className="text-sm">{x.type === "fixed" ? "แก้แล้ว" : "ไม่แก้"} — {x.label}</span>
                  {alert ? <Link href={`/adscan/${alert.id}`} className="text-xs text-secondary font-mono truncate">{alert.campaign}</Link> : <span className="text-xs text-gray-500 font-mono">{x.campaign_id}</span>}
                </span>
                <span className="text-sm">{x.by}</span>
                <span>{f ? <Chip sev={f.sev}>{f.result}</Chip> : <Chip sev="wait">{x.type === "fixed" ? "พ้นช่วงติดตามผล" : "ไม่แก้"}</Chip>}</span>
              </div>
            );
          })}
          {!d.actions.length && <div className="px-4 py-8 text-center text-sm text-gray-500">ยังไม่มีการบันทึก</div>}
        </div>
      </div>
    </div>
  );
}

export default function AdscanHistory() {
  const { data, error } = useAdscan();
  return <Gate data={data} error={error}>{(d) => <History d={d} />}</Gate>;
}
