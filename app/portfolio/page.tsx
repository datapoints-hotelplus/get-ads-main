"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import UserNav from "@/app/components/UserNav";

type Template = {
  id: string;
  name: string;
  metric: string;
  direction: "higher_better" | "lower_better";
  target: number | null;
  green_min: number | null;
  yellow_min: number | null;
  green_op: "<" | "<=" | ">" | ">=";
  yellow_op: "<" | "<=" | ">" | ">=";
};

type Profile = { id: string; name: string };

type AccountRow = {
  account_name: string;
  metrics: Record<string, number | null>;
};

type PortfolioData = {
  templates: Template[];
  profile: Profile;
  rows: AccountRow[];
  presetIds: string[];
  allAccounts: AllAccount[];
};

function compare(value: number, op: string, threshold: number): boolean {
  if (op === "<")  return value <  threshold;
  if (op === "<=") return value <= threshold;
  if (op === ">")  return value >  threshold;
  if (op === ">=") return value >= threshold;
  return false;
}

function getTrafficLight(
  value: number | null,
  tpl: Template,
): "green" | "yellow" | "red" | "gray" {
  if (value === null) return "gray";
  const { green_min, yellow_min, green_op, yellow_op } = tpl;
  if (green_min === null && yellow_min === null) return "gray";
  if (green_min  !== null && compare(value, green_op  ?? ">=", green_min))  return "green";
  if (yellow_min !== null && compare(value, yellow_op ?? ">=", yellow_min)) return "yellow";
  return "red";
}

const BAR_COLOR: Record<string, string> = {
  green: "#22c55e",
  yellow: "#facc15",
  red:    "#ef4444",
  gray: "bg-gray-300",
};

function fmt(v: number | null, metric: string): string {
  if (v === null) return "—";
  const currency = ["spend", "cpc", "cpm", "cost_per_lead", "cost_per_message", "cost_per_purchase", "purchase_value"];
  const pct = ["ctr"];
  if (pct.includes(metric)) return v.toFixed(2) + "%";
  if (currency.includes(metric)) return v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (metric === "roas") return v.toFixed(2) + "x";
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Template icon & color palette ───────────────────────────────────────────
const PALETTE = [
  { bg: "bg-violet-600",  ring: "ring-violet-200",  bar: "#818cf8" },
  { bg: "bg-blue-500",    ring: "ring-blue-200",    bar: "#60a5fa" },
  { bg: "bg-pink-500",    ring: "ring-pink-200",    bar: "#f472b6" },
  { bg: "bg-teal-500",    ring: "ring-teal-200",    bar: "#2dd4bf" },
  { bg: "bg-amber-500",   ring: "ring-amber-200",   bar: "#fbbf24" },
  { bg: "bg-orange-500",  ring: "ring-orange-200",  bar: "#fb923c" },
  { bg: "bg-emerald-500", ring: "ring-emerald-200", bar: "#34d399" },
  { bg: "bg-rose-500",    ring: "ring-rose-200",    bar: "#fb7185" },
  { bg: "bg-sky-500",     ring: "ring-sky-200",     bar: "#38bdf8" },
  { bg: "bg-indigo-500",  ring: "ring-indigo-200",  bar: "#818cf8" },
];

function fmtUnit(metric: string): string {
  const currency = ["spend","cpc","cpm","cost_per_lead","cost_per_message","cost_per_purchase","purchase_value"];
  if (metric === "ctr") return "%";
  if (metric === "roas") return "x";
  if (currency.includes(metric)) return "บาท";
  return "";
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ tpl, rows, index }: { tpl: Template; rows: AccountRow[]; index: number }) {
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    tpl.direction === "lower_better" ? "asc" : "desc",
  );

  const palette = PALETTE[index % PALETTE.length];

  const valOf = (r: AccountRow) => r.metrics[tpl.id] ?? 0;


  const values = rows.map(valOf);
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const lights = rows.map((r) => getTrafficLight(r.metrics[tpl.id], tpl));
  const green  = lights.filter((l) => l === "green").length;
  const yellow = lights.filter((l) => l === "yellow").length;
  const red    = lights.filter((l) => l === "red").length;
  const total  = rows.length;

  const sorted = [...rows].sort((a, b) =>
    sortDir === "asc" ? valOf(a) - valOf(b) : valOf(b) - valOf(a),
  );

  const maxVal = Math.max(...sorted.map(valOf), tpl.target ?? 0) * 1.2 || 1;
  const targetPct = tpl.target !== null ? (tpl.target / maxVal) * 100 : null;

  // x-axis ticks — 5 nice steps
  const step = Math.ceil((maxVal / 5) / 10) * 10 || 1;
  const ticks = Array.from({ length: 6 }, (_, i) => i * step).filter(v => v <= maxVal * 1.05);

  const byPerf = [...rows].sort((a, b) =>
    tpl.direction === "higher_better" ? valOf(b) - valOf(a) : valOf(a) - valOf(b),
  );
  const best  = byPerf[0];
  const worst = byPerf[byPerf.length - 1];

  const unit = fmtUnit(tpl.metric);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* ── Summary section ── */}
      <div className="p-4">
        {/* Title row */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className={`w-8 h-8 ${palette.bg} rounded-full flex items-center justify-center shrink-0 ring-4 ${palette.ring}`}>
            <span className="text-white text-xs font-bold">{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-gray-900 uppercase tracking-wide leading-tight truncate">
              {index + 1}. {tpl.name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{tpl.metric.replace(/_/g, " ")}{unit ? ` (${unit})` : ""}</p>
          </div>
        </div>

        {/* Avg / Target — 2 equal boxes */}
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          <div className="bg-gray-50 rounded-xl p-2.5">
            <p className="text-[10px] text-gray-400 font-medium mb-0.5">Average</p>
            <p className="text-sm font-bold text-gray-900 leading-tight truncate">{fmt(avg, tpl.metric)}</p>
            {unit && <p className="text-[10px] text-gray-400">{unit}</p>}
          </div>
          <div className={tpl.target !== null ? "bg-blue-50 rounded-xl p-2.5" : "bg-gray-50 rounded-xl p-2.5"}>
            <p className="text-[10px] font-medium mb-0.5 text-blue-500">Target</p>
            {tpl.target !== null ? (
              <>
                <p className="text-sm font-bold text-blue-700 leading-tight truncate">
                  {tpl.direction === "lower_better" ? "≤ " : "≥ "}{fmt(tpl.target, tpl.metric)}
                </p>
                {unit && <p className="text-[10px] text-blue-400">{unit}</p>}
              </>
            ) : (
              <p className="text-sm font-bold text-gray-300 leading-tight">—</p>
            )}
          </div>
        </div>

        {/* Traffic light counts */}
        <p className="text-xs text-gray-400 mb-1.5">ทั้งหมด {total} โรงแรม</p>
        <div className="flex gap-3 mb-2.5 flex-wrap justify-around">
          <span className="flex items-center gap-1 text-xs font-medium text-gray-700">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            {green} ({total > 0 ? ((green/total)*100).toFixed(1) : 0}%)
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-gray-700">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
            {yellow} ({total > 0 ? ((yellow/total)*100).toFixed(1) : 0}%)
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-gray-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            {red} ({total > 0 ? ((red/total)*100).toFixed(1) : 0}%)
          </span>
        </div>

        {/* Best / Worst */}
        {best && worst && best.account_name !== worst.account_name && (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-green-600 font-semibold truncate">Best: {best.account_name} ({fmt(valOf(best), tpl.metric)} {unit})</span>
            <span className="text-red-500 font-semibold truncate">Worst: {worst.account_name} ({fmt(valOf(worst), tpl.metric)} {unit})</span>
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-gray-100" />

      {/* ── Bar chart section ── */}
      <div className="p-4">
        {/* Chart header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-6 h-6 ${palette.bg} rounded-full flex items-center justify-center shrink-0`}>
              <span className="text-white text-[10px] font-bold">{index + 1}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 uppercase tracking-wide truncate">{index + 1}. {tpl.name}</p>
              <p className="text-[10px] text-gray-400 truncate">{tpl.metric.replace(/_/g, " ")}{unit ? ` (${unit})` : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0 ml-2">
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setSortDir("asc")}
                className={`px-1.5 py-0.5 rounded-md transition text-[10px] ${sortDir === "asc" ? "bg-white shadow-sm font-semibold text-gray-800" : "text-gray-400 hover:text-gray-600"}`}
              >ต่ำ→สูง</button>
              <button
                onClick={() => setSortDir("desc")}
                className={`px-1.5 py-0.5 rounded-md transition text-[10px] ${sortDir === "desc" ? "bg-white shadow-sm font-semibold text-gray-800" : "text-gray-400 hover:text-gray-600"}`}
              >สูง→ต่ำ</button>
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-gray-400">
          <span className="w-24 shrink-0">Hotel</span>
          <span className="flex-1 text-center">{tpl.metric.replace(/_/g, " ")}{unit ? ` (${unit})` : ""}</span>
          <span className="w-3" />
        </div>

        {/* Bars */}
        <div className="space-y-1 mb-3">
          {sorted.map((r) => {
            const val   = valOf(r);
            const pct   = (val / maxVal) * 100;
            const light = getTrafficLight(r.metrics[tpl.id], tpl);

            return (
              <div key={r.account_name} className="flex items-center gap-1.5">
                <span className="w-24 shrink-0 text-[11px] text-gray-700 truncate leading-5" title={r.account_name}>
                  {r.account_name}
                </span>
                <div className="relative flex-1 h-5">
                  {/* track */}
                  <div className="absolute inset-y-0 left-0 right-0 bg-gray-100 rounded" />
                  {/* bar */}
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-all"
                    style={{ width: `${pct}%`, backgroundColor: BAR_COLOR[light] ?? palette.bar }}
                  />
                  {/* target line */}
                  {targetPct !== null && (
                    <div
                      className="absolute -inset-y-0.5 border-l-2 border-dashed border-blue-400 z-10"
                      style={{ left: `${targetPct}%` }}
                    />
                  )}
                  {/* value label */}
                  <span
                    className="absolute top-0 bottom-0 flex items-center text-[11px] font-medium text-gray-700 z-10 pl-1"
                    style={{ left: `${Math.min(pct, 90)}%` }}
                  >
                    {fmt(val, tpl.metric)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis */}
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-24 shrink-0" />
          <div className="relative flex-1 h-4">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute text-[10px] text-gray-400 -translate-x-1/2"
                style={{ left: `${(t / maxVal) * 100}%` }}
              >
                {t.toLocaleString()}
              </span>
            ))}
          </div>
          <div className="w-3" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24 shrink-0" />
          <p className="text-xs text-gray-400 flex-1 text-center mt-1">{unit}</p>
        </div>

        {/* Target legend */}
        {tpl.target !== null && (
          <p className="text-xs text-blue-400 mt-3 flex items-center gap-1.5">
            <span className="inline-block w-8 border-t-2 border-dashed border-blue-400" />
            Target ({tpl.direction === "lower_better" ? "≤ " : "≥ "}{fmt(tpl.target, tpl.metric)} {unit})
          </p>
        )}
      </div>
    </div>
  );
}

type AllAccount = { account_id: string; account_name: string };

// ── Account multi-select dropdown ───────────────────────────────────────────
function AccountPicker({
  allAccounts,
  selected,
  onChange,
  onSelectAll,
}: {
  allAccounts: AllAccount[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  onSelectAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }

  const label =
    selected.size === 0
      ? "-- เลือก Account --"
      : selected.size === allAccounts.length
        ? "ทั้งหมด"
        : `${selected.size} accounts`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="input flex items-center justify-between gap-3 min-w-52 text-left"
      >
        <span className={selected.size === 0 ? "text-gray-400" : "text-gray-800"}>{label}</span>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {/* Select all / clear */}
          <div className="flex gap-2 px-3 py-2 border-b border-gray-100">
            <button
              type="button"
              onClick={() => {
                onChange(new Set(allAccounts.map((a) => a.account_id)));
                onSelectAll?.();
              }}
              className="text-xs text-secondary hover:underline font-medium"
            >
              เลือกทั้งหมด
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="text-xs text-gray-400 hover:underline"
            >
              ล้าง
            </button>
          </div>
          {allAccounts.map((a) => (
            <label
              key={a.account_id}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(a.account_id)}
                onChange={() => toggle(a.account_id)}
                className="accent-secondary"
              />
              <span className="text-sm text-gray-700 truncate">{a.account_name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Multi-select dropdown for profiles — same UX as AccountPicker.
function ProfilePicker({
  profiles,
  selected,
  onChange,
  overrideLabel,
}: {
  profiles: Profile[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  overrideLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }

  const label =
    overrideLabel ??
    (selected.size === 0
      ? "-- เลือก Profile --"
      : selected.size === profiles.length
        ? "ทั้งหมด"
        : selected.size === 1
          ? profiles.find((p) => selected.has(p.id))?.name ?? "1 profile"
          : `${selected.size} profiles`);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="input flex items-center justify-between gap-3 min-w-52 text-left h-10"
      >
        <span className={selected.size === 0 ? "text-gray-400" : "text-gray-800"}>{label}</span>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
          <div className="flex gap-2 px-3 py-2 border-b border-gray-100">
            <button
              type="button"
              onClick={() => onChange(new Set(profiles.map((p) => p.id)))}
              className="text-xs text-secondary hover:underline font-medium"
            >
              เลือกทั้งหมด
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="text-xs text-gray-400 hover:underline"
            >
              ล้าง
            </button>
          </div>
          {profiles.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                className="accent-secondary"
              />
              <span className="text-sm text-gray-700 truncate">{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [allAccounts, setAllAccounts] = useState<AllAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [latestDate, setLatestDate] = useState<string | null>(null);
  // When "select all accounts" also selects all profiles, skip the preset-reset
  // in the profile-change effect so the full account selection is preserved.
  const keepAccountsRef = useRef(false);

  // Load profiles once
  useEffect(() => {
    fetch("/api/admin/portfolio/profiles")
      .then((r) => r.json())
      .then((d) => {
        setProfiles(d.profiles ?? []);
        if (d.profiles?.length > 0) setSelectedProfiles(new Set([d.profiles[0].id]));
      });
  }, []);

  // When selected profiles change — load ONLY the filter metadata (account list +
  // preset). All profiles share the same KPI templates, so this just unions the
  // per-profile account presets. No metrics fetched; user must hit "ค้นหา".
  const profileKey = [...selectedProfiles].sort().join(",");
  useEffect(() => {
    if (selectedProfiles.size === 0) return;
    setError("");
    setData(null); // clear any previous report until the user searches again
    Promise.all(
      [...selectedProfiles].map((id) =>
        fetch(`/api/portfolio?${new URLSearchParams({ profile_id: id, meta: "1" })}`).then((r) => r.json()),
      ),
    ).then((results) => {
      const bad = results.find((d) => d.error);
      if (bad) { setError(bad.error); return; }
      const all = results[0].allAccounts ?? [];
      setAllAccounts(all);
      setLatestDate(results[0].latestDate ?? null);
      if (keepAccountsRef.current) {
        // triggered by "select all accounts" → keep every account selected
        keepAccountsRef.current = false;
        setSelectedAccounts(new Set(all.map((a: AllAccount) => a.account_id)));
      } else {
        // pre-fill from the union of every selected profile's preset
        setSelectedAccounts(new Set(results.flatMap((d) => d.presetIds ?? [])));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileKey]);

  function handleSearch() {
    if (selectedProfiles.size === 0) return;
    setLoading(true);
    setError("");
    // Templates are identical across profiles, so any selected profile_id works;
    // the account union is what actually scopes the report.
    const params = new URLSearchParams({ profile_id: [...selectedProfiles][0], dateFrom, dateTo });
    selectedAccounts.forEach((id) => params.append("account_ids", id));
    fetch(`/api/portfolio?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <UserNav subtitle="Portfolio" />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันเริ่มต้น</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันสิ้นสุด</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" />
          </div>
          <div >
            <label className="block text-xs text-gray-500 mb-1">Profile (Preset)</label>
            <ProfilePicker
              profiles={profiles}
              selected={selectedProfiles}
              onChange={setSelectedProfiles}
              overrideLabel={
                allAccounts.length > 0 && selectedAccounts.size === allAccounts.length
                  ? "ทั้งหมด"
                  : undefined
              }
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Accounts
            </label>
            <AccountPicker
              allAccounts={allAccounts}
              selected={selectedAccounts}
              onChange={setSelectedAccounts}
              onSelectAll={() => {
                // also select every profile; keep the full account selection
                // through the resulting meta reload
                if (selectedProfiles.size !== profiles.length) {
                  keepAccountsRef.current = true;
                  setSelectedProfiles(new Set(profiles.map((p) => p.id)));
                }
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || selectedProfiles.size === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "กำลังโหลด…" : "ค้นหา"}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {data && data.templates.length === 0 && (
          <p className="text-gray-400 text-sm">ยังไม่มี KPI templates — ไปสร้างที่ <button onClick={() => router.push("/admin/portfolio")} className="text-secondary underline">Admin → Portfolio</button></p>
        )}

        {data && data.rows.length === 0 && data.templates.length > 0 && (
          <p className="text-gray-400 text-sm">ไม่มีข้อมูลในช่วงวันที่นี้</p>
        )}

        {data && data.templates.length > 0 && data.rows.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {data.templates.map((tpl, i) => (
              <KpiCard key={tpl.id} tpl={tpl} rows={data.rows} index={i} />
            ))}
          </div>
        )}

        {latestDate && (
          <p className="text-center text-xs text-gray-400 pt-4">
            ข้อมูลล่าสุดถึงวันที่ {latestDate} 23:59 น.
          </p>
        )}
      </div>
    </div>
  );
}
