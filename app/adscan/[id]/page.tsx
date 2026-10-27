"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Mark, Node } from "@/lib/adscan";
import { DONE_CHOICES, SKIP_CHOICES, WINDOW, money, thDate, useAdscan, type AdscanAlert, type AdscanPayload } from "../data";
import { ADS_MANAGER, Aging, Chip, DataNote, Gate, SEV, TrendChart, card, costText, hotelPill } from "../ui";

const GRID = "grid grid-cols-[minmax(0,2.6fr)_72px_repeat(5,minmax(0,1fr))_104px] gap-2 px-3 py-2.5 rounded-lg items-center text-sm";
const MARK: Record<Mark, { tag: string; tagCls: string; bg: string }> = {
  bad: { tag: "ตัวต้นเหตุ", tagCls: "bg-red-700 text-white", bg: "bg-red-50" },
  good: { tag: "ทำได้ดี", tagCls: "bg-teal-700 text-white", bg: "bg-teal-50" },
  "": { tag: "", tagCls: "", bg: "bg-white" },
};
const segColor = (m: Mark) => (m === "bad" ? "bg-red-700 text-white" : m === "good" ? "bg-teal-700 text-white" : "bg-slate-300 text-secondary");

function TreeRow({ a, r, level, indent, toggle }: { a: AdscanAlert; r: Node; level: string; indent: string; toggle?: { open: boolean; onClick: () => void } }) {
  const m = MARK[r.mark];
  const over = r.cpr == null ? r.spend > 0 : r.cpr > a.green;
  const fmt = (v: number | null, dec: number, unit = "") => (v == null ? "—" : unit === "%" ? `${v.toFixed(2)}%` : money(v, dec));
  return (
    <div className={`${GRID} ${level === "Campaign" ? "bg-indigo-50 font-semibold" : m.bg}`}>
      <div className={`flex items-center gap-2 min-w-0 ${indent}`}>
        {toggle && (
          <button onClick={toggle.onClick} aria-expanded={toggle.open} aria-label={`${toggle.open ? "ซ่อน" : "แสดง"} Ad ใน ${r.name}`} className="w-7 h-7 shrink-0 rounded text-gray-600 hover:bg-gray-100">
            {toggle.open ? "▾" : "▸"}
          </button>
        )}
        <span className="flex flex-col min-w-0">
          <span className={`font-mono truncate ${level === "Ad" ? "text-xs font-semibold" : "font-semibold"}`} title={r.name}>{r.name}</span>
          {r.sub && <span className="text-[11px] text-gray-500">{r.sub}</span>}
        </span>
        {m.tag && <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${m.tagCls}`}>{m.tag}</span>}
      </div>
      <span className="text-[11px] font-semibold text-gray-600">{level}</span>
      <span className="text-right font-mono tabular-nums">{money(r.spend, 0)}{level !== "Campaign" && <span className="block text-[11px] text-gray-500">{r.share}% ของงบ</span>}</span>
      <span className="text-right font-mono tabular-nums">{r.res.toLocaleString("en-US")}</span>
      <span className={`text-right font-mono tabular-nums font-bold ${over ? "text-red-700" : "text-teal-700"}`}>{r.cpr == null && r.spend > 0 ? "ไม่มีผล" : fmt(r.cpr, a.dec)}</span>
      <span className="text-right font-mono tabular-nums text-gray-600">{fmt(r.cpm, 0)}</span>
      <span className="text-right font-mono tabular-nums text-gray-600">{fmt(r.ctr, 2, "%")}</span>
      <span className="text-right"><Chip sev={over ? "critical" : "ok"}>{over ? "เกินเกณฑ์" : "ในเกณฑ์"}</Chip></span>
    </div>
  );
}

/** AI Skill recommendation (TOR M3): generated the first time anyone opens this alert for the current data date, then reused. */
function AiBox({ id }: { id: string }) {
  const [r, setR] = useState<{ text: string; version: number; model: string; at: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    fetch(`/api/adscan/ai?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "AI ไม่ตอบ");
        if (live) setR(j);
      })
      .catch((e: Error) => live && setErr(e.message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <div className="bg-white border border-indigo-200 border-l-4 border-l-indigo-500 rounded-xl p-5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">คำแนะนำจาก AI</h2>
        {r && <span className="text-[11px] text-gray-500 font-mono">Skill v{r.version} · {r.model}</span>}
      </div>
      {busy ? <div className="text-sm text-gray-500">AI กำลังวิเคราะห์… (ครั้งแรกของวันอาจใช้เวลาสักครู่)</div>
        : err ? <div className="text-sm text-red-700">{err}</div>
        : r && <div className="text-sm whitespace-pre-wrap leading-relaxed">{r.text}</div>}
      <div className="text-[11px] text-gray-400">AI อาจผิดพลาดได้ — ตรวจตัวเลขในตารางก่อนแก้</div>
    </div>
  );
}

function Detail({ d, a, reload }: { d: AdscanPayload; a: AdscanAlert; reload: () => void }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [modal, setModal] = useState<"fixed" | "skipped" | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const good = a.kind === "good";
  const sets = a.tree.sets;
  const isOpen = (i: number) => open[i] ?? (sets.length === 1 || sets[i].mark !== "" || sets[i].ads.some((x) => x.mark !== ""));
  const kids: Node[] = a.level === "Ad Set" ? sets : sets[0]?.ads ?? [];
  const resShare = (k: Node) => (a.res > 0 ? Math.round((k.res / a.res) * 100) : 0);

  async function save() {
    setSaving(true);
    setErr("");
    const r = await fetch("/api/adscan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_id: a.id, type: modal, label: pick }) });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) return setErr(j.error || "บันทึกไม่สำเร็จ");
    setModal(null);
    reload();
  }

  const timeline = [
    ...(a.kind === "issue" || a.kind === "good"
      ? [{ key: "now", date: thDate(d.latestDate!), tag: SEV[a.sev].label, sev: a.sev, text: `${a.metric} ${WINDOW} วัน ${costText(a)} (เกณฑ์ ≤ ${money(a.green, a.dec)})`, sub: "" }]
      : []),
    ...a.actions.map((x) => ({
      key: String(x.id), date: thDate(x.created_at.slice(0, 10)), tag: x.type === "fixed" ? "แก้แล้ว" : "ไม่แก้",
      sev: x.type === "fixed" ? ("follow" as const) : ("wait" as const),
      text: `${x.by}: ${x.label}`, sub: x.value_at != null ? `ตอนบันทึก ${a.metric} ${money(x.value_at, a.dec)}` : "",
    })),
  ];

  return (
    <div className="space-y-4">
      <DataNote d={d} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/adscan" className="font-semibold text-secondary">‹ งานของฉัน</Link>
        <span className="text-gray-400">/</span>
        <Link href={`/adscan/hotels/${encodeURIComponent(a.hotelId)}`} className={hotelPill}>{a.hotel}</Link>
        <span className="text-gray-400">/</span>
        <span className="font-mono font-semibold">{a.campaign}</span>
      </div>

      <section className={`${card} ${SEV[a.sev].border} p-5 flex flex-wrap gap-4 items-center justify-between`}>
        <div className="flex-[1_1_420px] min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Chip sev={a.sev} />
            <Aging a={a} />
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-slate-700">{a.template}</span>
            <span className="text-gray-500">ช่วงที่ตรวจ: <strong className="text-gray-900">{thDate(a.windowFrom)}–{thDate(a.windowTo)} ({WINDOW} วัน)</strong></span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{a.headline}</h1>
          <div className="text-xs text-gray-600">
            เกณฑ์จาก Portfolio Template “{a.template}”: ปกติ ≤ {money(a.green, a.dec)} · ปานกลาง ≤ {money(a.yellow, a.dec)} · เกินกว่านั้นเร่งด่วน
          </div>
        </div>
        <div className="flex gap-4 bg-indigo-50 rounded-xl px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold text-gray-500">{a.metric}</div>
            <div className={`text-3xl font-bold font-mono ${good ? "text-teal-700" : a.sev === "critical" ? "text-red-700" : a.sev === "medium" ? "text-amber-800" : "text-gray-900"}`}>{costText(a)}</div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-[11px] font-semibold text-gray-500">{WINDOW} วันล่าสุด</div>
            <div>Spend <span className="font-mono font-semibold">{money(a.spend, 0)}</span></div>
            <div>{a.resLabel} <span className="font-mono font-semibold">{a.res.toLocaleString("en-US")}</span></div>
            {a.deltaPct != null && <div className="font-semibold">{a.deltaPct > 0 ? "+" : ""}{a.deltaPct}% เทียบเกณฑ์</div>}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[7_1_560px] min-w-0 space-y-4">
          <div className={`${card} p-5 space-y-3`}>
            <div>
              <h2 className="font-semibold">{a.metric} รายวัน 30 วัน</h2>
              <div className="text-sm text-gray-500">
                เส้นประแดง = เกณฑ์ปกติ · เส้นจุดส้ม = เกณฑ์ปานกลาง{a.band && " · แถบเขียว = ช่วงปกติของ Campaign นี้ก่อนช่วงที่ตรวจ"} · ชี้ที่จุดเพื่อดูค่า · วันที่ไม่มีผลลัพธ์เว้นว่าง
              </div>
            </div>
            <div className="overflow-x-auto"><TrendChart a={a} /></div>
            {a.analysis && <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm"><strong>อ่านกราฟ:</strong> {a.analysis}</div>}
          </div>

          {kids.length > 1 && a.res > 0 && (
            <div className={`${card} p-5 space-y-3`}>
              <div>
                <h2 className="font-semibold">งบใน Campaign นี้ไปอยู่ที่ {a.level} ไหน</h2>
                <div className="text-sm text-gray-500">ถ้าแถบบน (งบ) ยาวกว่าแถบล่าง (ผลลัพธ์) มาก แปลว่าตัวนั้นกินงบเกินผลงาน</div>
              </div>
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 items-center">
                {(["SPEND", a.resLabel.toUpperCase()] as const).map((label, row) => (
                  <div key={label} className="contents">
                    <span className="text-[11px] font-semibold text-gray-500">{label}</span>
                    <div className="flex gap-0.5 h-7">
                      {kids.map((k, i) => {
                        const v = row === 0 ? k.share : resShare(k);
                        return (
                          <div key={i} title={`${k.name} · ${v}%`} style={{ width: `${v}%` }} className={`rounded flex items-center justify-center text-xs font-bold font-mono overflow-hidden ${segColor(k.mark)}`}>
                            {v >= 12 && `${v}%`}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                {kids.map((k, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-sm ${segColor(k.mark)}`} />
                    <span className="font-mono">{k.name}</span>
                    <span className="text-gray-500 font-mono">งบ {k.share}% / ผล {resShare(k)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={`${card} p-5 space-y-3`}>
            <div>
              <h2 className="font-semibold">ไล่ดูทีละระดับ (Campaign › Ad Set › Ad)</h2>
              <div className="text-sm text-gray-500">ตัวเลข {WINDOW} วันล่าสุด · {a.metric} เทียบเกณฑ์ {money(a.green, a.dec)}</div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[880px] space-y-0.5">
                <div className={`${GRID} bg-indigo-100 text-xs font-bold`}>
                  <span>ชื่อ</span><span>ระดับ</span><span className="text-right">Spend</span><span className="text-right">{a.resLabel}</span>
                  <span className="text-right">{a.metric}</span><span className="text-right">CPM</span><span className="text-right">CTR (link)</span><span className="text-right">สถานะ</span>
                </div>
                <TreeRow a={a} r={a.tree} level="Campaign" indent="" />
                {sets.map((set, i) => (
                  <div key={i} className="space-y-0.5">
                    <TreeRow a={a} r={set} level="Ad Set" indent="pl-3" toggle={{ open: isOpen(i), onClick: () => setOpen({ ...open, [i]: !isOpen(i) }) }} />
                    {isOpen(i) && set.ads.map((ad, j) => <TreeRow key={j} a={a} r={ad} level="Ad" indent="pl-12" />)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-[5_1_340px] min-w-0 space-y-4">
          {(a.kind === "issue" || a.kind === "good") && <AiBox id={a.id} />}
          {a.action && (
            <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-primary rounded-xl p-5 space-y-3">
              <h2 className="font-semibold">{good ? "ข้อแนะนำ" : "สิ่งที่ต้องทำ"} <span className="text-xs font-normal text-gray-500">(คำนวณจากกฎ)</span></h2>
              <div className="bg-white rounded-lg p-4 space-y-2.5">
                <div className="font-bold text-secondary">{a.action}</div>
                {a.why && <div className="text-sm"><strong>ทำไม:</strong> {a.why}</div>}
                {a.effect && (
                  <div className="border-t border-dashed border-gray-200 pt-2.5">
                    <div className="text-[11px] font-semibold text-gray-500">ผลที่คาด (ประมาณการ)</div>
                    <div className="text-sm">{a.effect}</div>
                  </div>
                )}
                <a href={ADS_MANAGER} target="_blank" rel="noopener" className="inline-block px-3 py-2 rounded-lg border border-secondary text-secondary text-sm font-semibold">เปิดใน Ads Manager ↗</a>
              </div>
            </div>
          )}

          {a.kind === "issue" && (
            <div className={`${card} p-5 space-y-2.5`}>
              <div className="text-[11px] font-semibold text-gray-500">หลังแก้ใน Ads Manager แล้ว</div>
              {a.status !== "open" ? (
                <Chip sev={a.status === "fixed" ? "follow" : "wait"}>{a.status === "fixed" ? "บันทึกแล้วว่าแก้แล้ว · กำลังติดตามผล" : "บันทึกแล้วว่าไม่แก้"}</Chip>
              ) : d.needsMigration === "041_adscan_actions.sql" ? (
                <div className="text-sm text-amber-800">ยังบันทึกไม่ได้ — รอรัน migration ก่อน</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setModal("fixed"); setPick(null); setErr(""); }} className="min-h-12 rounded-lg bg-secondary text-white font-semibold">✓ แก้แล้ว</button>
                    <button onClick={() => { setModal("skipped"); setPick(null); setErr(""); }} className="min-h-12 rounded-lg border border-gray-300 text-gray-700 font-semibold">ไม่แก้ เพราะ…</button>
                  </div>
                  <div className="text-xs text-gray-500 text-center">บันทึกแล้วเรื่องนี้จะย้ายไป “ติดตามผล” และระบบเทียบตัวเลขก่อน–หลังให้</div>
                </>
              )}
            </div>
          )}

          {timeline.length > 0 && (
            <div className={`${card} p-5 space-y-3`}>
              <h2 className="font-semibold">ประวัติเรื่องนี้</h2>
              <ol className="relative border-l-2 border-indigo-100 ml-1.5 space-y-3.5">
                {timeline.map((t) => (
                  <li key={t.key} className="pl-4 relative">
                    <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full ring-4 ring-white bg-slate-400" />
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold">{t.date}</span><Chip sev={t.sev}>{t.tag}</Chip></div>
                    <div className="text-sm">{t.text}</div>
                    {t.sub && <div className="text-xs text-gray-500">{t.sub}</div>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-center justify-center p-5" onClick={() => setModal(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="dlg" onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 space-y-3.5">
            <h2 id="dlg" className="text-lg font-semibold">{modal === "fixed" ? "แก้อะไรไปใน Ads Manager?" : "ทำไมถึงไม่แก้?"}</h2>
            <div className="flex flex-wrap gap-2">
              {(modal === "fixed" ? DONE_CHOICES : SKIP_CHOICES).map((c) => (
                <button key={c} aria-pressed={pick === c} onClick={() => setPick(c)}
                  className={`min-h-11 px-4 rounded-full text-sm ${pick === c ? "border-2 border-secondary bg-indigo-50 text-secondary font-bold ring-2 ring-primary" : "border border-gray-300"}`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="text-sm text-gray-500">
              {modal === "fixed" ? "ระบบจะเทียบตัวเลขก่อน–หลังแก้ให้ใน “ติดตามผล”" : "เรื่องนี้จะไม่แสดงเป็นงานค้างจนกว่าจะครบ 14 วัน"}
            </div>
            {err && <div className="text-sm text-red-700">{err}</div>}
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setModal(null)} className="px-4 min-h-11 rounded-lg border border-gray-300">ยกเลิก</button>
              <button disabled={!pick || saving} onClick={save} className="px-4 min-h-11 rounded-lg bg-secondary text-white font-semibold disabled:opacity-40">
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlertDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useAdscan();
  return (
    <Gate data={data} error={error}>
      {(d) => {
        const a = d.alerts.find((x) => x.id === id);
        return a ? <Detail d={d} a={a} reload={reload} /> : (
          <div className={`${card} p-8 text-center space-y-2`}>
            <div className="font-semibold">ไม่พบเรื่องนี้</div>
            <div className="text-sm text-gray-500">Campaign อาจหยุดยิงแล้ว หรือไม่ได้อยู่ในโรงแรมที่คุณดูแล</div>
            <Link href="/adscan" className="text-sm font-semibold text-secondary">‹ กลับไปที่งานของฉัน</Link>
          </div>
        );
      }}
    </Gate>
  );
}
