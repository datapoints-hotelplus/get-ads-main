"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className="relative border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus-within:ring-2 focus-within:ring-blue-500 w-36 flex items-center justify-between">
        <span className={value ? "" : "text-gray-400"}>
          {value ? isoToDisplay(value) : "dd/mm/yyyy"}
        </span>
        <svg
          className="w-4 h-4 text-gray-400 pointer-events-none"
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
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  delta,
  invertColor,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  invertColor?: boolean; // true = green when negative (e.g. cost metrics)
}) {
  const showDelta = delta !== undefined && delta !== null;
  const isPositive = (delta ?? 0) > 0;
  const isNeutral = delta === 0;
  // For cost metrics (CPC, CPM, Cost/Purchase, etc.) lower is better → invert color
  const green = invertColor ? !isPositive : isPositive;

  return (
    <div className="bg-white -lg border border-gray-200 px-4 py-3 flex flex-col gap-0.5">
      <p className="text-xs text-gray-400 font-normal">{label}</p>
      <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
      {showDelta && (
        <p
          className={`text-xs font-medium flex items-center gap-0.5 ${
            isNeutral
              ? "text-gray-400"
              : green
                ? "text-green-600"
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
      "purchases",
      "roas",
      "ctr",
      "cpc",
      "cost_per_purchase",
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
          { key: "purchases", label: "purchases", fmt: (v: number) => fmtK(v) },
          { key: "revenue", label: "revenue", fmt: (v: number) => fmtK(v) },
          {
            key: "roas",
            label: "ROAS",
            fmt: (v: number) => `${v.toFixed(2)}x`,
          },
          { key: "ctr", label: "CTR", fmt: (v: number) => `${v.toFixed(2)}%` },
          { key: "cpc", label: "CPC", fmt: (v: number) => fmtK(v) },
          {
            key: "cost_per_purchase",
            label: "Cost/Purchase",
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
    <div className="bg-white -xl border border-gray-200 overflow-hidden">
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

  // ── Load options (cascading) whenever account/campaign changes ──────────────
  const loadOptions = useCallback(async (acc: string, camp: string) => {
    setOptLoading(true);
    const params = new URLSearchParams({ type: "options" });
    if (acc) params.set("account", acc);
    if (camp) params.set("campaign", camp);
    try {
      const res = await fetch(`/api/dashboard?${params}`);
      const json = await res.json();
      if (res.ok) setOptions(json as Options);
    } finally {
      setOptLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions(account, campaign);
  }, [account, campaign, loadOptions]);

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

  // Auto-fetch on mount
  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky filter bar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <form
            onSubmit={handleApply}
            className="flex flex-wrap items-end gap-3"
          >
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

            <div className="flex flex-col gap-1 min-w-44">
              <label className="text-xs font-medium text-gray-600">
                Account
              </label>
              <select
                value={account}
                onChange={(e) => handleAccountChange(e.target.value)}
                disabled={optLoading}
                className="border border-gray-300 -lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
            <div className="flex flex-col gap-1 min-w-56">
              <label className="text-xs font-medium text-gray-600">
                Campaign
              </label>
              <select
                value={campaign}
                onChange={(e) => handleCampaignChange(e.target.value)}
                disabled={optLoading}
                className="border border-gray-300 -lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
            <div className="flex flex-col gap-1 min-w-56">
              <label className="text-xs font-medium text-gray-600">
                Ad Set
              </label>
              <select
                value={adset}
                onChange={(e) => setAdset(e.target.value)}
                disabled={optLoading}
                className="border border-gray-300 -lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">-- ทั้งหมด --</option>
                {options.adsets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Apply */}
            <button
              type="submit"
              disabled={dataLoading}
              className="self-end bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-semibold px-5 py-2 -lg transition-colors"
            >
              {dataLoading ? "กำลังโหลด…" : "ค้นหา"}
            </button>

            {/* Reset */}
            <button
              type="button"
              onClick={() => {
                setDateFrom(firstOfMonth());
                setDateTo(today());
                setAccount("");
                setCampaign("");
                setAdset("");
              }}
              className="self-end border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm px-4 py-2 -lg transition-colors"
            >
              รีเซ็ต
            </button>
          </form>
        </div>
      </div>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page title */}
        <div className="mb-6">
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
          <div className="mb-6 p-4 bg-red-50 border border-red-200 -xl text-red-700 text-sm">
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
            <div className="flex gap-4 mb-8 items-start">
              {/* Scorecard grid */}
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <MetricCard
                  label="impressions"
                  value={fmtK(totals.impressions)}
                  delta={changes?.impressions}
                />
                <MetricCard
                  label="inline_link_clicks"
                  value={fmtK(totals.clicks)}
                  delta={changes?.clicks}
                />
                <MetricCard
                  label="unique_inline_link_clicks"
                  value={fmtK(totals.unique_clicks)}
                  delta={changes?.unique_clicks}
                />
                <MetricCard
                  label="reach"
                  value={fmtK(totals.reach)}
                  delta={changes?.reach}
                />
                <MetricCard
                  label="spend"
                  value={fmtK(totals.spend)}
                  delta={changes?.spend}
                  invertColor
                />
                <MetricCard
                  label="CPM"
                  value={fmt(totals.cpm, 1)}
                  delta={changes?.cpm}
                  invertColor
                />
                <MetricCard
                  label="campaign_name"
                  value={fmt(
                    (totals.clicks / Math.max(totals.impressions, 1)) * 100,
                    1,
                  )}
                  sub="CTR"
                />
                <MetricCard
                  label="CTR"
                  value={`${fmt(totals.ctr, 2)}%`}
                  delta={changes?.ctr}
                />
                <MetricCard
                  label="leads"
                  value={fmtK(totals.leads)}
                  delta={changes?.leads}
                />
                <MetricCard
                  label="Cost per leads"
                  value={totals.leads > 0 ? fmt(totals.cost_per_lead, 1) : "—"}
                  delta={changes?.cost_per_lead}
                  invertColor
                />
                <MetricCard
                  label="messaging_conversations_started"
                  value={fmtK(totals.messaging)}
                  delta={changes?.messaging}
                />
                <MetricCard
                  label="Cost per messaging conversation started"
                  value={
                    totals.messaging > 0 ? fmt(totals.cost_per_message, 1) : "—"
                  }
                  delta={changes?.cost_per_message}
                  invertColor
                />
                <MetricCard
                  label="post_shares"
                  value={fmtK(totals.post_shares)}
                  delta={changes?.post_shares}
                />
                <MetricCard
                  label="page_likes"
                  value={fmtK(totals.page_likes)}
                  delta={changes?.page_likes}
                />
                <MetricCard
                  label="Purchases"
                  value={fmtK(totals.purchases)}
                  delta={changes?.purchases}
                />
                <MetricCard
                  label="Cost/Purchase"
                  value={
                    totals.purchases > 0 ? fmt(totals.cost_per_purchase) : "—"
                  }
                  delta={changes?.cost_per_purchase}
                  invertColor
                />
              </div>
              {/* Frequency */}
              <div className="hidden lg:block w-52 flex-none">
                <div className="bg-white -lg border border-gray-200 px-4 py-3 flex flex-col gap-0.5">
                  <p className="text-xs text-gray-400 font-normal">Frequency</p>
                  <p className="text-2xl font-bold text-gray-900 leading-tight">
                    {fmt(totals.frequency, 2)}
                  </p>
                  <p className="text-xs text-gray-400">impressions / reach</p>
                  {changes?.frequency != null && (
                    <p
                      className={`text-xs font-medium flex items-center gap-0.5 ${
                        changes.frequency === 0
                          ? "text-gray-400"
                          : changes.frequency > 0
                            ? "text-red-500"
                            : "text-green-600"
                      }`}
                    >
                      {changes.frequency > 0
                        ? "▲"
                        : changes.frequency === 0
                          ? "●"
                          : "▼"}
                      {Math.abs(changes.frequency).toFixed(1)}%
                      <span className="text-gray-300 font-normal ml-1">
                        vs prev
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Data Table ────────────────────────────────────────────────── */}
            {rows.length > 0 ? (
              <HeatmapTable rows={rows} />
            ) : (
              <div className="text-center py-16 text-gray-400 text-sm">
                ไม่พบข้อมูลในช่วงเวลาที่เลือก
              </div>
            )}
          </>
        )}

        {!dataLoading && !totals && !error && (
          <div className="text-center py-16 text-gray-400 text-sm">
            กดปุ่ม &ldquo;ค้นหา&rdquo; เพื่อดูข้อมูล
          </div>
        )}
      </div>
    </div>
  );
}
