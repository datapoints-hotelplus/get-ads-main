import type { Sev } from "@/lib/adscan";
import { WINDOW, money, thDate, type AdscanAlert, type AdscanPayload } from "./data";

export const SEV: Record<Sev, { label: string; cls: string; border: string }> = {
  critical: { label: "เร่งด่วน", cls: "bg-red-50 text-red-700 border-red-200", border: "border-l-4 border-l-red-600" },
  medium: { label: "ปานกลาง", cls: "bg-amber-50 text-amber-800 border-amber-200", border: "border-l-4 border-l-amber-500" },
  good: { label: "ข่าวดี", cls: "bg-teal-50 text-teal-700 border-teal-200", border: "border-l-4 border-l-teal-600" },
  ok: { label: "ปกติ", cls: "bg-green-50 text-green-800 border-green-200", border: "" },
  wait: { label: "รอข้อมูล", cls: "bg-gray-100 text-gray-600 border-gray-200", border: "" },
  follow: { label: "ติดตามผล", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", border: "" },
};

export function Chip({ sev, children }: { sev: Sev; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${SEV[sev].cls}`}>
      {children ?? SEV[sev].label}
    </span>
  );
}

export const card = "bg-white border border-gray-200 rounded-xl shadow-sm";
export const hotelPill = "px-2.5 py-0.5 rounded-full bg-indigo-50 text-secondary text-xs font-semibold";
export const ADS_MANAGER = "https://adsmanager.facebook.com/adsmanager/";

type Tone = "bad" | "warn" | "good" | undefined;
const toneCls = (t: Tone) =>
  t === "bad" ? "text-red-700 font-bold" : t === "warn" ? "text-amber-800 font-bold" : t === "good" ? "text-teal-700 font-bold" : "text-gray-900 font-semibold";

export function Metric({ k, v, tone }: { k: string; v: string; tone?: Tone }) {
  return (
    <div className="flex-1 min-w-[110px] bg-gray-50 rounded-md px-2.5 py-2">
      <div className="text-[11px] font-semibold tracking-wide text-gray-500">{k}</div>
      <div className={`font-mono tabular-nums ${toneCls(tone)}`}>{v}</div>
    </div>
  );
}

const tone = (a: AdscanAlert): Tone => (a.sev === "critical" ? "bad" : a.sev === "medium" ? "warn" : a.sev === "good" ? "good" : undefined);
export const costText = (a: AdscanAlert) => (a.value == null ? (a.spend > 0 ? `ไม่มี ${a.resLabel}` : "—") : money(a.value, a.dec));

/** The 4 numbers every alert card shows. */
export function strip(a: AdscanAlert) {
  return [
    { k: `SPEND ${WINDOW} วัน`, v: money(a.spend, 0) },
    { k: a.metric.toUpperCase(), v: costText(a), tone: tone(a) },
    { k: "เกณฑ์", v: `≤ ${money(a.green, a.dec)}` },
    { k: "ส่วนต่าง", v: a.deltaPct == null ? "—" : `${a.deltaPct > 0 ? "+" : ""}${a.deltaPct}%`, tone: tone(a) },
  ];
}

/** Last WINDOW×2 days, threshold dashed. Days with no result leave a gap. */
export function Sparkline({ a }: { a: AdscanAlert }) {
  const vals = a.trend.slice(-WINDOW * 2);
  const max = Math.max(...vals.map((v) => v ?? 0), a.green) * 1.1;
  const X = (i: number) => (i * 120) / (vals.length - 1);
  const Y = (v: number) => 34 - (v / max) * 30;
  const color = a.sev === "good" ? "#0B8A7E" : a.sev === "critical" ? "#D93025" : "#B45309";
  return (
    <svg viewBox="0 0 120 36" width="100%" height="36" preserveAspectRatio="none" role="img" aria-label={`${a.metric} ${vals.length} วันล่าสุด เทียบเกณฑ์`}>
      <line x1="0" x2="120" y1={Y(a.green)} y2={Y(a.green)} stroke="#D93025" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
      <path d={path(vals, X, Y)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function path(vals: (number | null)[], X: (i: number) => number, Y: (v: number) => number) {
  let d = "", pen = false;
  vals.forEach((v, i) => {
    if (v == null) return void (pen = false);
    d += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** 30-day daily cost vs the green/yellow thresholds, prior-period band and the checked window. */
export function TrendChart({ a }: { a: AdscanAlert }) {
  const [x0, x1, y0, y1] = [52, 704, 16, 212];
  const n = a.trend.length;
  const vals = a.trend.filter((v): v is number => v != null);
  const hi = Math.max(...vals, a.yellow, a.band?.[1] ?? 0) * 1.12;
  const p = 10 ** Math.floor(Math.log10(hi / 4));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= hi / 4)!;
  const ymax = step * 4;
  const X = (i: number) => x0 + (i * (x1 - x0)) / (n - 1);
  const Y = (v: number) => y1 - (Math.min(v, ymax) / ymax) * (y1 - y0);
  const winX = X(n - WINDOW) - (x1 - x0) / (n - 1) / 2;
  const tick = (v: number) => money(v, step >= 1 ? 0 : 2);
  const last = [...a.trend].reverse().find((v) => v != null);
  return (
    <svg viewBox="0 0 720 240" width="100%" role="img" className="block min-w-[560px]"
      aria-label={`${a.metric} รายวัน ${thDate(a.dates[0])}–${thDate(a.dates[n - 1])} ล่าสุด ${last == null ? "—" : money(last, a.dec)} เกณฑ์ ${money(a.green, a.dec)}`}>
      <rect x={winX} y={y0} width={x1 + 6 - winX} height={y1 - y0} fill={a.sev === "good" ? "rgba(11,138,126,0.08)" : "rgba(217,48,37,0.07)"} />
      {a.band && <rect x={x0} y={Y(a.band[1])} width={x1 - x0} height={Math.max(1, Y(a.band[0]) - Y(a.band[1]))} fill="#0B8A7E" fillOpacity="0.16" />}
      {[1, 2, 3, 4].map((k) => (
        <g key={k}>
          <line x1={x0} x2={x1} y1={Y(step * k)} y2={Y(step * k)} stroke="#E0E8FF" />
          <text x="44" y={Y(step * k) + 4} textAnchor="end" fontSize="10" fill="#606B85">{tick(step * k)}</text>
        </g>
      ))}
      <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="#C5C6CF" />
      <line x1={x0} x2={x1} y1={Y(a.yellow)} y2={Y(a.yellow)} stroke="#B45309" strokeWidth="1" strokeDasharray="2 4" />
      <line x1={x0} x2={x1} y1={Y(a.green)} y2={Y(a.green)} stroke="#D93025" strokeWidth="1.5" strokeDasharray="6 4" />
      <text x={x1 - 4} y={Y(a.green) - 6} textAnchor="end" fontSize="11" fontWeight="700" fill="#B42318">เกณฑ์ {money(a.green, a.dec)}</text>
      <text x={winX + 6} y="30" fontSize="11" fontWeight="700" fill={a.sev === "good" ? "#087066" : "#B42318"}>ช่วงที่ตรวจ {WINDOW} วัน</text>
      <path d={path(a.trend, X, Y)} fill="none" stroke="#1A2B4A" strokeWidth="2" strokeLinejoin="round" />
      {a.trend.map((v, i) =>
        v == null ? null : (
          // ponytail: native <title> tooltip; custom hover card if users want richer detail
          <circle key={i} cx={X(i)} cy={Y(v)} r={i === n - 1 ? 5 : 3} fill={v > a.green ? "#D93025" : "#1A2B4A"} stroke="#fff" strokeWidth="1.5">
            <title>{`${thDate(a.dates[i])} · ${a.metric} ${money(v, a.dec)} · ${v > a.green ? "เกินเกณฑ์" : "อยู่ในเกณฑ์"}`}</title>
          </circle>
        ),
      )}
      {[0, 7, 14, 21, n - 1].map((i) => (
        <text key={i} x={X(i)} y="230" textAnchor="middle" fontSize="10" fill="#606B85">{thDate(a.dates[i])}</text>
      ))}
    </svg>
  );
}

/** Data date + the one-time migration warning, shown at the top of each page. */
export function DataNote({ d }: { d: AdscanPayload }) {
  return (
    <>
      {d.needsMigration && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          ต้องรัน <code>supabase/migrations/{d.needsMigration}</code> ใน Supabase ก่อน — ระหว่างนี้บางส่วน (บันทึกการแก้ / ค้างมากี่วัน) ยังไม่ทำงาน
        </div>
      )}
      <div className="text-sm text-gray-500">
        ข้อมูลล่าสุด <strong className="text-gray-900">{d.latestDate ? thDate(d.latestDate) : "—"}</strong> · ตรวจย้อนหลัง {WINDOW} วัน · เกณฑ์จาก Portfolio Template
      </div>
    </>
  );
}

/** Loading / error / empty shell so each page only renders the happy path. */
export function Gate({ data, error, children }: { data: AdscanPayload | null; error: string; children: (d: AdscanPayload) => React.ReactNode }) {
  if (error) return <div className={`${card} p-8 text-center text-red-700`}>โหลดข้อมูลไม่ได้: {error}</div>;
  if (!data) return <div className={`${card} p-8 text-center text-gray-500`}>กำลังตรวจข้อมูล…</div>;
  if (!data.hotels.length)
    return <div className={`${card} p-8 text-center text-gray-500`}>ยังไม่มีโรงแรมให้ตรวจ — บัญชีนี้ยังไม่ได้รับสิทธิ์ Ads Account หรือ Ads Account ที่ได้รับถูกปิดใช้งานอยู่ (admin ตรวจได้ที่หน้า “ผู้ใช้งาน” และ “Ads Account (Facebook)”)</div>;
  return <>{children(data)}</>;
}

/** "ค้างมา N วัน · แจ้งครั้งที่ N" — from the persistent episode. */
export function Aging({ a }: { a: AdscanAlert }) {
  if (a.daysOpen == null) return null;
  return (
    <span className="text-xs text-gray-600 whitespace-nowrap">
      ค้างมา <strong className="text-gray-900">{a.daysOpen}</strong> วัน · แจ้งครั้งที่ <strong className="text-gray-900">{a.timesSeen}</strong>
    </span>
  );
}
