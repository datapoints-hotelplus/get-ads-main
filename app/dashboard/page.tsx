"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Chart } from "react-google-charts";
import FrequencyGauge from "../FrequencyGauge";
import ThaiGeoChart from "../ThaiGeoChart";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeoRegion {
  region: string;
  inline_link_clicks: number;
  spend: number;
  impressions: number;
  reach: number;
  purchases: number;
  purchase_value: number;
}

interface TimeSeriesPoint {
  date: string;
  spend: number;
  impressions: number;
  cpm: number;
  inline_link_clicks: number;
  unique_inline_link_clicks: number;
  cpc: number;
  messaging: number;
  cost_per_message: number;
  post_engagement: number;
  cost_per_engagement: number;
  reach: number;
  leads: number;
}

interface Options {
  accounts: string[];
  campaigns: string[];
  adsets: string[];
}

interface Totals {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  unique_clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  cost_per_purchase: number;
  leads: number;
  cost_per_lead: number;
  messaging: number;
  cost_per_message: number;
  post_shares: number;
  page_likes: number;
  post_engagement: number;
  cost_per_engagement: number;
  cost_per_like: number;
}

interface GroupRow {
  campaign_name: string;
  adset_name: string;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  unique_clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cost_per_purchase: number;
  post_engagement: number;
  cost_per_engagement: number;
  cost_per_like: number;
}

interface Changes {
  spend: number | null;
  reach: number | null;
  impressions: number | null;
  clicks: number | null;
  unique_clicks: number | null;
  purchases: number | null;
  revenue: number | null;
  roas: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  frequency: number | null;
  cost_per_purchase: number | null;
  cost_per_lead: number | null;
  cost_per_message: number | null;
  leads: number | null;
  messaging: number | null;
  post_shares: number | null;
  page_likes: number | null;
  post_engagement: number | null;
  cost_per_engagement: number | null;
  cost_per_like: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: decimals });
}

function fmtK(n: number): string {
  if (n >= 1_000_000)
    return (
      (n / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 1 }) +
      "M"
    );
  if (n >= 1_000)
    return (
      (n / 1_000).toLocaleString("th-TH", { maximumFractionDigits: 1 }) + "K"
    );
  return n.toLocaleString("th-TH", { maximumFractionDigits: 1 });
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div
        onClick={() => inputRef.current?.showPicker()}
        className="relative border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus-within:ring-2 focus-within:ring-blue-500 w-40 cursor-pointer flex items-center justify-between"
      >
        <span className={value ? "" : "text-gray-400"}>
          {value ? isoToDisplay(value) : "dd/mm/yyyy"}
        </span>
        <svg
          className="w-4 h-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
    </div>
  );
}

// ─── Metric Tooltips ──────────────────────────────────────────────────────────

const METRIC_TIPS: Record<string, string> = {
  Impressions: "จำนวนครั้งที่โฆษณาถูกแสดง (รวมซ้ำ)",
  "Link Clicks": "จำนวนคลิกไปยังปลายทาง",
  "Unique Link Clicks": "จำนวนคนที่คลิก (ไม่นับซ้ำ)",
  Reach: "จำนวนคนที่เห็นโฆษณา (ไม่นับซ้ำ)",
  "Reach (ทุก Account)": "จำนวนคนที่เห็นโฆษณา (ไม่นับซ้ำ)",
  Spend: "ยอดใช้จ่ายโฆษณาทั้งหมด",
  CPM: "ต้นทุนต่อการแสดงผล 1,000 ครั้ง (ยิ่งต่ำยิ่งดี)",
  "Campaign Count": "จำนวนแคมเปญที่กำลังรันในช่วงเวลา",
  CTR: "อัตราการคลิกต่อการเห็นโฆษณา Click ÷ Impression (%)",
  Leads: "จำนวนลูกค้าที่กรอกฟอร์ม",
  "Cost / Lead": "ต้นทุนต่อ 1 Lead",
  Messages: "จำนวนคนที่เริ่มแชท",
  "Cost / Message": "ต้นทุนต่อ 1 คนที่ทัก",
  "Post Shares": "จำนวนครั้งที่แชร์โพสต์",
  "Page Likes": "จำนวนคนกดติดตามเพจ",
  "Post Engagement": "จำนวนการมีส่วนร่วมกับโพสต์ (like, comment, share)",
  "Cost / Engagement": "ต้นทุนต่อ 1 การมีส่วนร่วม",
  "Cost / Like": "ต้นทุนต่อ 1 คนกดถูกใจเพจ",
};

// Map MetricCard label → highlight metric_key
const LABEL_TO_KEY: Record<string, string> = {
  Impressions: "impressions",
  "Link Clicks": "clicks",
  "Unique Link Clicks": "unique_clicks",
  Reach: "reach",
  "Reach (ทุก Account)": "reach",
  Spend: "spend",
  CPM: "cpm",
  "Campaign Count": "campaign_count",
  CTR: "ctr",
  Leads: "leads",
  "Cost / Lead": "cost_per_lead",
  Messages: "messages",
  "Cost / Message": "cost_per_message",
  "Post Shares": "post_shares",
  "Page Likes": "page_likes",
  "Post Engagement": "post_engagement",
  "Cost / Engagement": "cost_per_engagement",
  "Cost / Like": "cost_per_like",
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  delta,
  invertColor,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  invertColor?: boolean;
  highlight?: boolean;
}) {
  const showDelta = delta !== undefined && delta !== null;
  const isPositive = (delta ?? 0) > 0;
  const isNeutral = delta === 0;
  const green = invertColor ? !isPositive : isPositive;
  const tip = METRIC_TIPS[label];

  return (
    <div
      className={`rounded-xl border px-4 py-4 flex flex-col gap-1 transition-shadow ${
        highlight
          ? "bg-blue-50 border-blue-400 shadow-md ring-2 ring-blue-200"
          : "bg-white border-gray-200 hover:shadow-md"
      }`}
    >
      <div className="flex items-center gap-1">
        <p
          className={`text-xs font-medium truncate ${highlight ? "text-blue-700" : "text-gray-500"}`}
        >
          {label}
        </p>
        {highlight && <span className="text-blue-500 text-xs">★</span>}
        {tip && (
          <span className="relative group cursor-help flex-shrink-0">
            <span className="text-gray-600 hover:text-blue-500 transition-colors text-xs">
              ⓘ
            </span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-normal w-48 text-center opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none shadow-lg">
              {tip}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </span>
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
      {showDelta && (
        <p
          className={`text-xs font-medium flex items-center gap-0.5 ${
            isNeutral
              ? "text-gray-400"
              : green
                ? "text-emerald-600"
                : "text-red-500"
          }`}
        >
          {isPositive ? "▲" : isNeutral ? "●" : "▼"}
          {Math.abs(delta!).toFixed(1)}%
          <span className="text-gray-300 font-normal ml-1">vs prev</span>
        </p>
      )}
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Chart Section Header with Tooltip ────────────────────────────────────────

function ChartHeader({ title, tip }: { title: string; tip: string }) {
  return (
    <div className="flex items-start gap-2 mb-4">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <span className="relative group cursor-help flex-shrink-0 mt-1">
        <span className="text-gray-300 hover:text-blue-500 transition-colors text-sm">
          ⓘ
        </span>
        <span className="absolute bottom-full left-0 mb-2 px-4 py-3 bg-gray-900 text-white text-xs rounded-xl w-72 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none shadow-xl whitespace-pre-line leading-relaxed">
          {tip}
          <span className="absolute top-full left-4 border-4 border-transparent border-t-gray-900" />
        </span>
      </span>
    </div>
  );
}

// ─── Heatmap Table ────────────────────────────────────────────────────────────

// Per-column color schemes matching Looker Studio style
const COL_COLORS: Record<string, string> = {
  impressions: "59,130,246", // blue
  clicks: "249,115,22", // orange
  unique_clicks: "249,115,22", // orange
  reach: "132,204,22", // lime-green
  spend: "168,85,247", // purple
  revenue: "168,85,247", // purple
  purchases: "16,185,129", // emerald
  roas: "16,185,129", // emerald
  ctr: "14,165,233", // sky
  cpc: "239,68,68", // red
  cost_per_purchase: "239,68,68", // red
  cpm: "239,68,68", // red
  post_engagement: "16,185,129", // emerald
  cost_per_engagement: "239,68,68", // red
  cost_per_like: "239,68,68", // red
};

function heatCell(value: number, min: number, max: number, col: string) {
  if (max === min) return undefined;
  const t = (value - min) / (max - min);
  const rgb = COL_COLORS[col] ?? "156,163,175";
  return `rgba(${rgb},${(t * 0.55 + 0.05).toFixed(2)})`;
}

function HeatmapTable({ rows }: { rows: GroupRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "spend", desc: true },
  ]);

  // Pre-compute column min/max for heatmap
  const colStats = useMemo(() => {
    const keys = [
      "impressions",
      "clicks",
      "unique_clicks",
      "reach",
      "spend",
      "revenue",
      "roas",
      "ctr",
      "cpc",
      "post_engagement",
      "cost_per_engagement",
      "cost_per_like",
    ] as (keyof GroupRow)[];
    const stats: Record<string, { min: number; max: number }> = {};
    for (const k of keys) {
      const vals = rows.map((r) => r[k] as number).filter(Number.isFinite);
      stats[k] = {
        min: vals.length ? Math.min(...vals) : 0,
        max: vals.length ? Math.max(...vals) : 0,
      };
    }
    return stats;
  }, [rows]);

  const columns = useMemo<ColumnDef<GroupRow>[]>(
    () => [
      {
        id: "row_number",
        header: "",
        cell: ({ row, table }) => {
          const pageIndex = table.getState().pagination.pageIndex;
          const pageSize = table.getState().pagination.pageSize;
          return (
            <span className="text-gray-400 text-xs">
              {pageIndex * pageSize + row.index + 1}.
            </span>
          );
        },
        size: 36,
        enableSorting: false,
      },
      {
        accessorKey: "campaign_name",
        header: "Campaign",
        cell: ({ getValue, row }) => (
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-gray-700 font-medium truncate max-w-60">
              {getValue<string>()}
            </span>
            <span className="text-xs text-gray-400 truncate max-w-60">
              {row.original.adset_name}
            </span>
          </div>
        ),
        size: 260,
      },
      ...(
        [
          {
            key: "impressions",
            label: "impressions",
            fmt: (v: number) => fmtK(v),
          },
          {
            key: "clicks",
            label: "inline_link_clicks",
            fmt: (v: number) => fmtK(v),
          },
          {
            key: "unique_clicks",
            label: "unique_link_cli…",
            fmt: (v: number) => fmtK(v),
          },
          { key: "reach", label: "reach", fmt: (v: number) => fmtK(v) },
          { key: "spend", label: "spend", fmt: (v: number) => fmtK(v) },
          { key: "revenue", label: "revenue", fmt: (v: number) => fmtK(v) },
          {
            key: "roas",
            label: "ROAS",
            fmt: (v: number) => `${v.toFixed(2)}x`,
          },
          { key: "ctr", label: "CTR", fmt: (v: number) => `${v.toFixed(2)}%` },
          { key: "cpc", label: "CPC", fmt: (v: number) => fmtK(v) },
          {
            key: "post_engagement",
            label: "Post Engagement",
            fmt: (v: number) => fmtK(v),
          },
          {
            key: "cost_per_engagement",
            label: "Cost/Engagement",
            fmt: (v: number) => fmtK(v),
          },
          {
            key: "cost_per_like",
            label: "Cost/Like",
            fmt: (v: number) => fmtK(v),
          },
        ] as const
      ).map(({ key, label, fmt: fmtFn }) => ({
        accessorKey: key,
        header: label,
        meta: {
          getBg: (v: number) => {
            const { min, max } = colStats[key] ?? { min: 0, max: 0 };
            return heatCell(v, min, max, key);
          },
        },
        cell: ({ getValue }: { getValue: () => unknown }) =>
          fmtFn(getValue() as number),
        size: 110,
      })),
    ],
    [colStats],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 100 } },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = rows.length;
  const start = pageIndex * pageSize + 1;
  const end = Math.min(start + pageSize - 1, totalRows);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-gray-200 bg-gray-50">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className={`px-3 py-2 text-xs font-semibold text-gray-500 select-none whitespace-nowrap ${
                      header.column.getCanSort()
                        ? "cursor-pointer hover:text-gray-900"
                        : ""
                    } ${header.id === "campaign_name" || header.id === "row_number" ? "text-left" : "text-right"}`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {header.column.getIsSorted() === "asc" && " ▲"}
                      {header.column.getIsSorted() === "desc" && " ▼"}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, idx) => (
              <tr
                key={row.id}
                className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  idx % 2 === 1 ? "bg-gray-50/40" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as
                    | { getBg?: (v: number) => string | undefined }
                    | undefined;
                  const bg = meta?.getBg
                    ? meta.getBg(cell.getValue() as number)
                    : undefined;
                  return (
                    <td
                      key={cell.id}
                      className={`px-3 py-2 text-xs font-medium text-gray-900 ${
                        cell.column.id === "campaign_name" ||
                        cell.column.id === "row_number"
                          ? "text-left"
                          : "text-right"
                      }`}
                      style={bg ? { backgroundColor: bg } : undefined}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
        <span>
          {start} - {end} / {totalRows.toLocaleString("th-TH")}
        </span>
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="px-2 py-1  border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ‹
        </button>
        <button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="px-2 py-1  border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ›
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Filter state
  const [dateFrom, setDateFrom] = useState(firstOfMonth()); // ISO yyyy-mm-dd
  const [dateTo, setDateTo] = useState(today()); // ISO yyyy-mm-dd
  const [account, setAccount] = useState("");
  const [campaign, setCampaign] = useState("");
  const [adset, setAdset] = useState("");

  // Options for selects
  const [options, setOptions] = useState<Options>({
    accounts: [],
    campaigns: [],
    adsets: [],
  });
  const [optLoading, setOptLoading] = useState(false);

  // Data state
  const [totals, setTotals] = useState<Totals | null>(null);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [prevPeriod, setPrevPeriod] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  // Geo data state
  const [geoRegions, setGeoRegions] = useState<GeoRegion[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);

  // Demographics data state
  const [ageGender, setAgeGender] = useState<
    { age: string; gender: string; impressions: number }[]
  >([]);
  const [devices, setDevices] = useState<
    { device: string; impressions: number }[]
  >([]);
  const [demoLoading, setDemoLoading] = useState(false);

  // Highlight metrics config
  const [highlightMetrics, setHighlightMetrics] = useState<string[]>([]);

  // Time-series data state (CPM vs Impressions)
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [tsLoading, setTsLoading] = useState(false);

  // Auth state
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
    display_name: string;
  } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Check auth on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/user/auth")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
        } else {
          // Not logged in — redirect to login
          window.location.href = "/login";
        }
      })
      .catch(() => {
        window.location.href = "/login";
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/user/auth", { method: "DELETE" });
    setCurrentUser(null);
    window.location.href = "/login";
  };

  // ── Log dashboard access on mount ──────────────────────────────────────────
  useEffect(() => {
    fetch("/api/user/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: "dashboard" }),
    }).catch(() => {
      /* ignore log errors */
    });
  }, []);

  // ── Load options (cascading) whenever account/campaign changes ──────────────
  const loadOptions = useCallback(
    async (acc: string, camp: string) => {
      setOptLoading(true);
      const params = new URLSearchParams({ type: "options" });
      if (acc) params.set("account", acc);
      if (camp) params.set("campaign", camp);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      try {
        const res = await fetch(`/api/dashboard?${params}`);
        const json = await res.json();
        if (res.ok) setOptions(json as Options);
      } finally {
        setOptLoading(false);
      }
    },
    [dateFrom, dateTo],
  );

  useEffect(() => {
    loadOptions(account, campaign);
  }, [account, campaign, loadOptions]);

  // Fetch highlight metrics when campaign changes
  useEffect(() => {
    if (!campaign) {
      setHighlightMetrics([]);
      return;
    }
    fetch(
      `/api/dashboard?type=highlights&campaign=${encodeURIComponent(campaign)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        const hl = data.highlights?.[campaign] ?? [];
        setHighlightMetrics(hl);
      })
      .catch(() => setHighlightMetrics([]));
  }, [campaign]);

  // ── Fetch dashboard data ────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setDataLoading(true);
    setError(null);
    const params = new URLSearchParams({ type: "data" });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (account) params.set("account", account);
    if (campaign) params.set("campaign", campaign);
    if (adset) params.set("adset", adset);

    try {
      const res = await fetch(`/api/dashboard?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "เกิดข้อผิดพลาด");
      } else {
        setTotals(json.totals);
        setChanges(json.changes ?? null);
        setPrevPeriod(json.prevPeriod ?? null);
        setRows(json.rows);
        setCount(json.count);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setDataLoading(false);
    }
  }, [dateFrom, dateTo, account, campaign, adset]);

  // ── Build filter params helper ──────────────────────────────────────────────
  const buildFilterParams = useCallback(
    (type: string) => {
      const params = new URLSearchParams({ type });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (account) params.set("account", account);
      if (campaign) params.set("campaign", campaign);
      if (adset) params.set("adset", adset);
      return params;
    },
    [dateFrom, dateTo, account, campaign, adset],
  );

  // ── Fetch geo data ──────────────────────────────────────────────────────────
  const fetchGeo = useCallback(async () => {
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/dashboard?${buildFilterParams("geo")}`);
      const json = await res.json();
      if (res.ok) setGeoRegions(json.regions ?? []);
    } catch {
      /* ignore */
    } finally {
      setGeoLoading(false);
    }
  }, [buildFilterParams]);

  // ── Fetch time-series data (CPM vs Impressions) ─────────────────────────────
  const fetchTimeSeries = useCallback(async () => {
    setTsLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard?${buildFilterParams("timeseries")}`,
      );
      const json = await res.json();
      if (res.ok) setTimeSeries(json.series ?? []);
    } catch {
      /* ignore */
    } finally {
      setTsLoading(false);
    }
  }, [buildFilterParams]);

  // ── Fetch demographics data ─────────────────────────────────────────────────
  const fetchDemographics = useCallback(async () => {
    setDemoLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard?${buildFilterParams("demographics")}`,
      );
      const json = await res.json();
      if (res.ok) {
        setAgeGender(json.ageGender ?? []);
        setDevices(json.devices ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setDemoLoading(false);
    }
  }, [buildFilterParams]);

  // Load options on mount
  useEffect(() => {
    loadOptions("", "");
  }, [loadOptions]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAccountChange = (val: string) => {
    setAccount(val);
    setCampaign("");
    setAdset("");
  };

  const handleCampaignChange = (val: string) => {
    setCampaign(val);
    setAdset("");
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
    fetchGeo();
    fetchTimeSeries();
    fetchDemographics();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar with auth ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {/* Auth row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <span className="text-lg font-bold text-gray-900">
                Ads Dashboard
              </span>
            </div>
            <div className="flex items-center gap-3">
              {authLoading ? (
                <span className="text-xs text-gray-400">...</span>
              ) : currentUser ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-blue-600">
                        {(currentUser.display_name || currentUser.username)
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm text-gray-700 font-medium">
                      {currentUser.display_name || currentUser.username}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-sm text-red-500 hover:text-red-600 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    ออกจากระบบ
                  </button>
                </>
              ) : (
                <a
                  href="/login"
                  className="text-sm text-white font-medium px-4 py-1.5 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  เข้าสู่ระบบ
                </a>
              )}
            </div>
          </div>

          {/* Filter form */}
          <form onSubmit={handleApply} className="space-y-3">
            {/* Filter row */}
            <div className="flex flex-wrap items-end gap-3">
              {/* Date From */}
              <DatePickerField
                label="วันเริ่มต้น"
                value={dateFrom}
                onChange={setDateFrom}
              />
              <DatePickerField
                label="วันสิ้นสุด"
                value={dateTo}
                onChange={setDateTo}
              />

              <div className="flex flex-col gap-1 min-w-44 flex-1">
                <label className="text-xs font-medium text-gray-600">
                  Account
                </label>
                <select
                  value={account}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  disabled={optLoading}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">-- ทั้งหมด --</option>
                  {options.accounts.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campaign */}
              <div className="flex flex-col gap-1 min-w-44 flex-1">
                <label className="text-xs font-medium text-gray-600">
                  Campaign
                </label>
                <select
                  value={campaign}
                  onChange={(e) => handleCampaignChange(e.target.value)}
                  disabled={optLoading}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 truncate"
                >
                  <option value="">-- ทั้งหมด --</option>
                  {options.campaigns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Adset */}
              <div className="flex flex-col gap-1 min-w-44 flex-1">
                <label className="text-xs font-medium text-gray-600">
                  Ad Set
                </label>
                <select
                  value={adset}
                  onChange={(e) => setAdset(e.target.value)}
                  disabled={optLoading}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 truncate"
                >
                  <option value="">-- ทั้งหมด --</option>
                  {options.adsets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Button row */}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={dataLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                {dataLoading ? "กำลังโหลด…" : "ค้นหา"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDateFrom(firstOfMonth());
                  setDateTo(today());
                  setAccount("");
                  setCampaign("");
                  setAdset("");
                }}
                className="border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm px-4 py-2 rounded-lg transition-colors"
              >
                รีเซ็ต
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page title */}
        <div className="mb-6" data-aos="fade-down">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {count > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              ข้อมูล {count.toLocaleString("th-TH")} แถว ·{" "}
              {isoToDisplay(dateFrom)} ถึง {isoToDisplay(dateTo)}
              {prevPeriod && (
                <span className="text-gray-400 ml-2">
                  (เทียบกับ {isoToDisplay(prevPeriod.from)} ถึง{" "}
                  {isoToDisplay(prevPeriod.to)})
                </span>
              )}
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {dataLoading && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            <svg
              className="animate-spin mr-2 h-5 w-5 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            กำลังโหลดข้อมูล…
          </div>
        )}

        {!dataLoading && totals && (
          <>
            {/* ── Scorecards + Gauge ─────────────────────────────────────── */}
            <div className="flex gap-4 mb-8 items-start" data-aos="fade-up">
              {/* Scorecard grid */}
              {(() => {
                const isHL = (label: string) => {
                  const key = LABEL_TO_KEY[label];
                  return key ? highlightMetrics.includes(key) : false;
                };
                return (
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <MetricCard
                      label="Impressions"
                      value={fmtK(totals.impressions)}
                      delta={changes?.impressions}
                      highlight={isHL("Impressions")}
                    />
                    <MetricCard
                      label="Link Clicks"
                      value={fmtK(totals.clicks)}
                      delta={changes?.clicks}
                      highlight={isHL("Link Clicks")}
                    />
                    <MetricCard
                      label="Unique Link Clicks"
                      value={fmtK(totals.unique_clicks)}
                      delta={changes?.unique_clicks}
                      highlight={isHL("Unique Link Clicks")}
                    />
                    <MetricCard
                      label={account ? "Reach" : "Reach (ทุก Account)"}
                      value={fmtK(totals.reach)}
                      delta={changes?.reach}
                      highlight={isHL(
                        account ? "Reach" : "Reach (ทุก Account)",
                      )}
                    />
                    <MetricCard
                      label="Spend"
                      value={`฿${fmtK(totals.spend)}`}
                      delta={changes?.spend}
                      invertColor
                      highlight={isHL("Spend")}
                    />
                    <MetricCard
                      label="CPM"
                      value={fmt(totals.cpm, 1)}
                      delta={changes?.cpm}
                      invertColor
                      highlight={isHL("CPM")}
                    />
                    <MetricCard
                      label="Campaign Count"
                      value={String(
                        new Set(rows.map((r) => r.campaign_name)).size,
                      )}
                      sub="จำนวนแคมเปญในช่วงเวลา"
                      highlight={isHL("Campaign Count")}
                    />
                    <MetricCard
                      label="CTR"
                      value={`${fmt(totals.ctr, 2)}%`}
                      delta={changes?.ctr}
                      highlight={isHL("CTR")}
                    />
                    <MetricCard
                      label="Leads"
                      value={fmtK(totals.leads)}
                      delta={changes?.leads}
                      highlight={isHL("Leads")}
                    />
                    <MetricCard
                      label="Cost / Lead"
                      value={
                        totals.leads > 0
                          ? `฿${fmt(totals.cost_per_lead, 1)}`
                          : "—"
                      }
                      delta={changes?.cost_per_lead}
                      invertColor
                      highlight={isHL("Cost / Lead")}
                    />
                    <MetricCard
                      label="Messages"
                      value={fmtK(totals.messaging)}
                      delta={changes?.messaging}
                      highlight={isHL("Messages")}
                    />
                    <MetricCard
                      label="Cost / Message"
                      value={
                        totals.messaging > 0
                          ? `฿${fmt(totals.cost_per_message, 1)}`
                          : "—"
                      }
                      delta={changes?.cost_per_message}
                      invertColor
                      highlight={isHL("Cost / Message")}
                    />
                    <MetricCard
                      label="Post Shares"
                      value={fmtK(totals.post_shares)}
                      delta={changes?.post_shares}
                      highlight={isHL("Post Shares")}
                    />
                    <MetricCard
                      label="Page Likes"
                      value={fmtK(totals.page_likes)}
                      delta={changes?.page_likes}
                      highlight={isHL("Page Likes")}
                    />
                    <MetricCard
                      label="Post Engagement"
                      value={fmtK(totals.post_engagement)}
                      delta={changes?.post_engagement}
                      highlight={isHL("Post Engagement")}
                    />
                    <MetricCard
                      label="Cost / Engagement"
                      value={
                        totals.post_engagement > 0
                          ? `฿${fmt(totals.cost_per_engagement)}`
                          : "—"
                      }
                      delta={changes?.cost_per_engagement}
                      invertColor
                      highlight={isHL("Cost / Engagement")}
                    />
                    <MetricCard
                      label="Cost / Like"
                      value={
                        totals.page_likes > 0
                          ? `฿${fmt(totals.cost_per_like)}`
                          : "—"
                      }
                      delta={changes?.cost_per_like}
                      invertColor
                      highlight={isHL("Cost / Like")}
                    />
                  </div>
                );
              })()}
              {/* Frequency Gauge */}
              <div className="hidden lg:block w-64 flex-none">
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <p className="text-xs text-gray-500 font-medium text-center">
                      Frequency
                    </p>
                    <span className="relative group cursor-help flex-shrink-0">
                      <span className="text-gray-300 hover:text-blue-500 transition-colors text-xs">
                        ⓘ
                      </span>
                      <span className="absolute top-full left-1/2 -translate-x-1/2 mb-2 px-4 py-3 bg-gray-900 text-white text-xs rounded-xl w-72 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none shadow-xl whitespace-pre-line leading-relaxed">
                        {
                          "Frequency ที่ดีตามประเภทธุรกิจ\n\n🏨 โรงแรม (ตัดสินใจเร็ว)\n→ 2.0 – 3.0\n\n🏝️ รีสอร์ท (ต้องเห็นซ้ำ)\n→ 3.0 – 4.5\n\n🏠 ที่พักทั่วไป\n→ 2.5 – 3.5\n\n📌 Baseline แนะนำ: 2.5 – 3.5\n\n💎 พูลวิลล่า / luxury → 3.5+\n🛏️ ห้องพักทั่วไป → ~2.5\n\nของแพง/ตัดสินใจนาน → Frequency สูง\nของถูก/ตัดสินใจไว → Frequency ต่ำพอ"
                        }
                        <span className="absolute bottom-full right-4 border-4 border-transparent border-b-gray-900" />
                      </span>
                    </span>
                  </div>
                  <div className="h-[160px] relative">
                    <FrequencyGauge
                      frequency={totals.frequency}
                      delta={changes?.frequency}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 font-medium px-2 -mt-1">
                    <span>0</span>
                    <span>8</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Data Table ────────────────────────────────────────────────── */}
            {rows.length > 0 ? (
              <div data-aos="fade-up" data-aos-delay="100">
                <HeatmapTable rows={rows} />
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400 text-sm">
                ไม่พบข้อมูลในช่วงเวลาที่เลือก
              </div>
            )}
          </>
        )}

        {/* ── CPM vs Impressions Chart ──────────────────────────────────── */}
        {tsLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            กำลังโหลดข้อมูลกราฟ…
          </div>
        ) : (
          timeSeries.length > 0 && (
            <div className="mt-8">
              <ChartHeader
                title="ต้นทุนต่อการมองเห็น (CPM) เทียบกับ จำนวนการแสดงผล"
                tip={`ใช้ดูว่าการยิงโฆษณา "คุ้มไหม"\n\n🔵 แท่งน้ำเงิน = คนเห็น (Impressions)\n🔴 เส้นสีแดง = ต้นทุนต่อ 1,000 คน (CPM)\n\n✅ ถ้า CPM ลด แต่ Impressions เพิ่ม (แท่งสีน้ำเงินสูงกว่าเส้นสีแดง) = ดี\n❌ ถ้า CPM สูง แต่ Impressions ไม่ขึ้น (เส้นสีแดงสูงกว่าแท่งสีน้ำเงิน) = เริ่มแพง\n\n⚠️ ควรเลือก Reach campaign ในการแสดงผลของกราฟนี้ เพื่อผลลัพธ์ที่ดีที่สุด`}
              />
              <div
                className="bg-white border border-gray-200 rounded-lg p-4"
                data-aos="fade-up"
              >
                <Chart
                  chartType="ComboChart"
                  width="100%"
                  height="400px"
                  data={[
                    ["Date", "impressions", "cpm"],
                    ...timeSeries.map((p) => [p.date, p.impressions, p.cpm]),
                  ]}
                  options={{
                    seriesType: "bars",
                    series: {
                      0: {
                        type: "bars",
                        targetAxisIndex: 1,
                        color: "#93c5fd",
                      },
                      1: {
                        type: "line",
                        targetAxisIndex: 0,
                        color: "#ef4444",
                        lineWidth: 2,
                        curveType: "function",
                      },
                    },
                    vAxes: {
                      0: {
                        title: "cpm",
                        format: "#,###",
                        minValue: 0,
                      },
                      1: {
                        title: "impressions",
                        format: "short",
                        minValue: 0,
                      },
                    },
                    hAxis: {
                      slantedText: true,
                      slantedTextAngle: 45,
                      textStyle: { fontSize: 10 },
                    },
                    legend: { position: "top" },
                    chartArea: {
                      left: 80,
                      right: 80,
                      top: 40,
                      bottom: 80,
                    },
                    bar: { groupWidth: "80%" },
                    backgroundColor: "#ffffff",
                  }}
                />
              </div>
            </div>
          )
        )}

        {/* ── Clicks vs CPC Chart ──────────────────────────────────────── */}
        {tsLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            กำลังโหลดข้อมูลกราฟ…
          </div>
        ) : (
          timeSeries.length > 0 &&
          (() => {
            // เส้นเขียว = ค่าเฉลี่ย CPC ทั้งเดือน (ผลรวม CPC ทุกวัน / จำนวนวัน)
            const daysWithCpc = timeSeries.filter((p) => p.cpc > 0);
            const avgCpc =
              daysWithCpc.length > 0
                ? parseFloat(
                    (
                      daysWithCpc.reduce((s, p) => s + p.cpc, 0) /
                      daysWithCpc.length
                    ).toFixed(2),
                  )
                : 0;
            return (
              <div className="mt-8">
                <ChartHeader
                  title="จำนวนคลิก เทียบกับ ต้นทุนต่อคลิก"
                  tip={`ใช้ดูว่าคน "สนใจคลิกไหม"\n\n🔵 แท่งน้ำเงิน = จำนวนคลิก\n🔴 เส้นสีแดง = ราคาต่อคลิก (CPC)\n\n✅ คลิกเยอะ + CPC ถูก (แท่งทั้ง 2 สูงกว่าเส้นสีแดง) = ดี\n❌ คลิกน้อย + CPC แพง (เส้นสีแดงสูงกว่าแท่งทั้ง 2) = ครีเอทีฟ/กลุ่มเป้าหมายมีปัญหา\n\n⚠️ ควรเลือก Message หรือ Page like campaign ในการแสดงผลของกราฟนี้ เพื่อผลลัพธ์ที่ดีที่สุด`}
                />
                <div
                  className="bg-white border border-gray-200 rounded-lg p-4"
                  data-aos="fade-up"
                >
                  <Chart
                    chartType="ComboChart"
                    width="100%"
                    height="400px"
                    data={[
                      [
                        "Date",
                        "inline_link_clicks",
                        "unique_inline_link_clicks",
                        "cpc",
                        { role: "annotation" },
                        `เฉลี่ย (${avgCpc.toFixed(2)})`,
                      ],
                      ...timeSeries.map((p) => [
                        p.date,
                        p.inline_link_clicks,
                        p.unique_inline_link_clicks,
                        p.cpc,
                        null,
                        parseFloat(avgCpc.toFixed(2)),
                      ]),
                    ]}
                    options={{
                      seriesType: "bars",
                      series: {
                        0: {
                          type: "bars",
                          targetAxisIndex: 1,
                          color: "#60a5fa",
                        },
                        1: {
                          type: "bars",
                          targetAxisIndex: 1,
                          color: "#c4b5fd",
                        },
                        2: {
                          type: "line",
                          targetAxisIndex: 0,
                          color: "#ef4444",
                          lineWidth: 2,
                          curveType: "function",
                        },
                        3: {
                          type: "line",
                          targetAxisIndex: 0,
                          color: "#22c55e",
                          lineWidth: 2,
                          lineDashStyle: [0, 0],
                          pointSize: 0,
                          enableInteractivity: false,
                        },
                      },
                      vAxes: {
                        0: {
                          title: "cpc | unique_inline_link_clicks",
                          format: "#,###",
                          minValue: 0,
                        },
                        1: {
                          title: "inline_link_clicks",
                          format: "#,###",
                          minValue: 0,
                        },
                      },
                      hAxis: {
                        slantedText: true,
                        slantedTextAngle: 45,
                        textStyle: { fontSize: 10 },
                      },
                      legend: { position: "top" },
                      chartArea: {
                        left: 80,
                        right: 80,
                        top: 40,
                        bottom: 80,
                      },
                      bar: { groupWidth: "80%" },
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>
              </div>
            );
          })()
        )}

        {/* ── Messaging Conversations vs Cost per Message Chart ─────────────── */}
        {tsLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            กำลังโหลดข้อมูลกราฟ…
          </div>
        ) : (
          timeSeries.length > 0 &&
          timeSeries.some((p) => p.messaging > 0) && (
            <div className="mt-8">
              <ChartHeader
                title="จำนวนแชทลูกค้า เทียบกับ ต้นทุนต่อแชท"
                tip={`ใช้ดูว่าโฆษณาสร้าง "ลูกค้าทัก" จริงไหม\n\n🔵 แท่งน้ำเงิน = จำนวนคนทัก (Messaging)\n🔴 เส้นสีแดง = ราคาต่อ 1 แชท\n\n✅ ทักเยอะ + cost ต่ำ (แท่งสีน้ำเงินสูงกว่าเส้นสีแดง) = ดีมาก\n❌ ทักน้อย + cost สูง = ยิงผิดกลุ่ม/ครีเอทีฟไม่โดน\n\n⚠️ ควรเลือก Message campaign ในการแสดงผลของกราฟนี้ เพื่อผลลัพธ์ที่ดีที่สุด`}
              />
              <div
                className="bg-white border border-gray-200 rounded-lg p-4"
                data-aos="fade-up"
              >
                <Chart
                  chartType="ComboChart"
                  width="100%"
                  height="400px"
                  data={[
                    [
                      "Date",
                      "Cost per messaging conversation started",
                      "messaging_conversations_started",
                    ],
                    ...timeSeries.map((p) => [
                      p.date,
                      p.cost_per_message,
                      p.messaging,
                    ]),
                  ]}
                  options={{
                    seriesType: "bars",
                    series: {
                      0: {
                        type: "line",
                        targetAxisIndex: 0,
                        color: "#ef4444",
                        lineWidth: 2,
                        curveType: "function",
                      },
                      1: {
                        type: "bars",
                        targetAxisIndex: 1,
                        color: "#60a5fa",
                      },
                    },
                    vAxes: {
                      0: {
                        title: "Cost per messaging conversation started",
                        format: "#,###",
                        minValue: 0,
                      },
                      1: {
                        title: "messaging_conversations_started",
                        format: "#,###",
                        minValue: 0,
                      },
                    },
                    hAxis: {
                      slantedText: true,
                      slantedTextAngle: 45,
                      textStyle: { fontSize: 10 },
                    },
                    legend: { position: "top" },
                    chartArea: {
                      left: 80,
                      right: 80,
                      top: 40,
                      bottom: 80,
                    },
                    bar: { groupWidth: "80%" },
                    backgroundColor: "#ffffff",
                  }}
                />
              </div>
            </div>
          )
        )}

        {/* ── Post Engagement vs Cost per Engagement Chart ──────────────────── */}
        {tsLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            กำลังโหลดข้อมูลกราฟ…
          </div>
        ) : (
          timeSeries.length > 0 &&
          timeSeries.some((p) => p.post_engagement > 0) && (
            <div className="mt-8">
              <ChartHeader
                title="การมีส่วนร่วม เทียบกับ ต้นทุนต่อการมีส่วนร่วม"
                tip={`ใช้ดูว่าคอนเทนต์ "น่าสนใจไหม"\n\n🔵 แท่งน้ำเงิน = จำนวน engagement\n🔴 เส้นสีแดง = ราคาต่อ engagement\n\n✅ engagement สูง + cost ต่ำ (แท่งสีน้ำเงินสูงกว่าเส้นสีแดง) = คอนเทนต์ดี\n\n⚠️ ควรเลือก Engagement campaign ในการแสดงผลของกราฟนี้ เพื่อผลลัพธ์ที่ดีที่สุด`}
              />
              <div
                className="bg-white border border-gray-200 rounded-lg p-4"
                data-aos="fade-up"
              >
                <Chart
                  chartType="ComboChart"
                  width="100%"
                  height="400px"
                  data={[
                    ["Date", "Cost per Engagement", "Post Engagement"],
                    ...timeSeries.map((p) => [
                      p.date,
                      p.cost_per_engagement,
                      p.post_engagement,
                    ]),
                  ]}
                  options={{
                    seriesType: "bars",
                    series: {
                      0: {
                        type: "line",
                        targetAxisIndex: 0,
                        color: "#ef4444",
                        lineWidth: 2,
                        curveType: "function",
                      },
                      1: {
                        type: "bars",
                        targetAxisIndex: 1,
                        color: "#60a5fa",
                      },
                    },
                    vAxes: {
                      0: {
                        title: "Cost per Engagement",
                        format: "#,###",
                        minValue: 0,
                      },
                      1: {
                        title: "Post Engagement",
                        format: "#,###",
                        minValue: 0,
                      },
                    },
                    hAxis: {
                      slantedText: true,
                      slantedTextAngle: 45,
                      textStyle: { fontSize: 10 },
                    },
                    legend: { position: "top" },
                    chartArea: {
                      left: 80,
                      right: 80,
                      top: 40,
                      bottom: 80,
                    },
                    bar: { groupWidth: "80%" },
                    backgroundColor: "#ffffff",
                  }}
                />
              </div>
            </div>
          )
        )}

        {/* ── Campaign Overview Chart (all lines) ──────────────────────────── */}
        {tsLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            กำลังโหลดข้อมูลกราฟ…
          </div>
        ) : (
          timeSeries.length > 0 && (
            <div className="mt-8">
              <ChartHeader
                title="ภาพรวมแคมเปญ"
                tip={`ใช้ดูภาพรวมทั้งหมดในช่วงเวลาเดียวกัน\n\n- Spend = ใช้เงินเท่าไหร่\n- Impressions / Reach = คนเห็น\n- Messaging = คนทัก\n- Leads = ลูกค้า\n\nดูว่าเงินที่ใช้ → ได้ผลลัพธ์ไหม\n\n⚠️ สามารถเลือก รวมทุก campaign ในการแสดงผลของกราฟนี้เพื่อดูภาพรวมแคมเปญ`}
              />
              <div
                className="bg-white border border-gray-200 rounded-lg p-4"
                data-aos="fade-up"
              >
                <Chart
                  chartType="ComboChart"
                  width="100%"
                  height="400px"
                  data={[
                    [
                      "Date",
                      "spend",
                      "messaging_conversations_started",
                      "impressions",
                      "reach (รายวัน)",
                      "leads",
                    ],
                    ...timeSeries.map((p) => [
                      p.date,
                      p.spend,
                      p.messaging,
                      p.impressions,
                      p.reach,
                      p.leads,
                    ]),
                  ]}
                  options={{
                    seriesType: "line",
                    series: {
                      0: {
                        targetAxisIndex: 1,
                        color: "#60a5fa",
                        lineWidth: 2,
                        curveType: "function",
                      },
                      1: {
                        targetAxisIndex: 1,
                        color: "#fb923c",
                        lineWidth: 2,
                        curveType: "function",
                      },
                      2: {
                        targetAxisIndex: 0,
                        color: "#a78bfa",
                        lineWidth: 2,
                        curveType: "function",
                      },
                      3: {
                        targetAxisIndex: 0,
                        color: "#a3e635",
                        lineWidth: 2,
                        curveType: "function",
                      },
                      4: {
                        targetAxisIndex: 1,
                        color: "#22d3ee",
                        lineWidth: 2,
                        curveType: "function",
                      },
                    },
                    vAxes: {
                      0: {
                        title: "impressions | reach",
                        format: "short",
                        minValue: 0,
                      },
                      1: {
                        title: "spend | messaging | leads",
                        format: "short",
                        minValue: 0,
                      },
                    },
                    hAxis: {
                      slantedText: true,
                      slantedTextAngle: 45,
                      textStyle: { fontSize: 10 },
                    },
                    legend: { position: "top" },
                    chartArea: {
                      left: 80,
                      right: 80,
                      top: 40,
                      bottom: 80,
                    },
                    backgroundColor: "#ffffff",
                    pointSize: 0,
                  }}
                />
              </div>
            </div>
          )
        )}

        {/* ── Geo Chart (independent of data loading) ──────────────────────── */}
        {geoLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            กำลังโหลดข้อมูล Region…
          </div>
        ) : (
          geoRegions.length > 0 && (
            <div className="mt-8">
              <ChartHeader
                title="พื้นที่ — จำนวนคลิก"
                tip={`ใช้ดูว่าโฆษณาได้ผลในพื้นที่ไหนมากที่สุด\n\nจัดอันดับจังหวัดตามจำนวนคลิก\nช่วยวางแผนกลุ่มเป้าหมายตามภูมิภาค`}
              />
              <div
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                data-aos="fade-up"
              >
                {/* Map */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <ThaiGeoChart
                    regions={geoRegions.map((r) => ({
                      region: r.region,
                      value: r.inline_link_clicks,
                    }))}
                  />
                </div>

                {/* Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 text-gray-600 font-medium">
                            #
                          </th>
                          <th className="text-left px-4 py-2 text-gray-600 font-medium">
                            Region
                          </th>
                          <th className="text-right px-4 py-2 text-gray-600 font-medium">
                            inline_link_clicks
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {geoRegions.map((r, i) => (
                          <tr
                            key={r.region}
                            className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                          >
                            <td className="px-4 py-1.5 text-gray-400">
                              {i + 1}.
                            </td>
                            <td className="px-4 py-1.5 text-gray-900">
                              {r.region}
                            </td>
                            <td className="px-4 py-1.5 text-right text-gray-900 font-medium">
                              {r.inline_link_clicks.toLocaleString("th-TH")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ── Demographics: Age/Gender + Device ────────────────────────────── */}
        {demoLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            กำลังโหลดข้อมูล Demographics…
          </div>
        ) : (
          (ageGender.length > 0 || devices.length > 0) && (
            <div className="mt-8">
              <ChartHeader
                title="กลุ่มเป้าหมาย"
                tip={`ใช้ดูว่าโฆษณาเข้าถึงกลุ่มไหนมากที่สุด\n\n📊 กราฟแท่ง = แยกตามอายุ + เพศ\n🍩 กราฟวงกลม = แยกตามอุปกรณ์\n\nช่วยปรับ targeting ให้ตรงกลุ่มมากขึ้น`}
              />
              <div
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                data-aos="fade-up"
              >
                {/* Age/Gender Stacked Bar Chart */}
                {ageGender.length > 0 && (
                  <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4">
                    <Chart
                      chartType="BarChart"
                      width="100%"
                      height="400px"
                      data={(() => {
                        const ages = [
                          ...new Set(ageGender.map((r) => r.age)),
                        ].sort();
                        const genders = [
                          ...new Set(ageGender.map((r) => r.gender)),
                        ].sort();
                        const header = ["Age", ...genders];
                        const rows = ages.map((age) => {
                          const row: (string | number)[] = [age];
                          for (const g of genders) {
                            const match = ageGender.find(
                              (r) => r.age === age && r.gender === g,
                            );
                            row.push(match?.impressions ?? 0);
                          }
                          return row;
                        });
                        return [header, ...rows];
                      })()}
                      options={{
                        isStacked: true,
                        colors: ["#f9a8d4", "#60a5fa", "#c4b5fd"],
                        hAxis: { format: "short", minValue: 0 },
                        vAxis: { textStyle: { fontSize: 12 } },
                        legend: { position: "top" },
                        chartArea: { left: 60, right: 20, top: 40, bottom: 20 },
                        bar: { groupWidth: "70%" },
                        backgroundColor: "#ffffff",
                      }}
                    />
                  </div>
                )}

                {/* Device Donut Chart */}
                {devices.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <Chart
                      chartType="PieChart"
                      width="100%"
                      height="400px"
                      data={[
                        ["Device", "Impressions"],
                        ...devices.map((d) => [d.device, d.impressions]),
                      ]}
                      options={{
                        pieHole: 0.45,
                        colors: [
                          "#a3e635",
                          "#fb923c",
                          "#f472b6",
                          "#86efac",
                          "#60a5fa",
                        ],
                        legend: {
                          position: "right",
                          textStyle: { fontSize: 11 },
                        },
                        chartArea: { left: 10, right: 10, top: 20, bottom: 20 },
                        backgroundColor: "#ffffff",
                        pieSliceTextStyle: { fontSize: 11 },
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {!dataLoading && !totals && !error && (
          <div className="text-center py-16 text-sm">
            {!dateFrom || !dateTo ? (
              <>
                <p className="text-red-500 font-medium mb-2">กรุณากรอกวันที่</p>
                <p className="text-gray-400">
                  เลือกวันเริ่มต้นและวันสิ้นสุด แล้วกดปุ่ม &ldquo;ค้นหา&rdquo;
                </p>
              </>
            ) : (
              <p className="text-gray-400">
                กดปุ่ม &ldquo;ค้นหา&rdquo; เพื่อดูข้อมูล
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
