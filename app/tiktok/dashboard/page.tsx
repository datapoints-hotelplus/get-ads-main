"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactSelect from "react-select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  LabelList,
  Line,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ColumnDef } from "@tanstack/react-table";
import ThaiGeoChart from "../../ThaiGeoChart";
import SortableTable from "@/app/components/SortableTable";
import DateInput from "@/app/components/DateInput";
import AdminNav from "@/app/components/AdminNav";
import UserNav from "@/app/components/UserNav";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Advertiser {
  advertiser_id: string;
  advertiser_name: string;
}

interface AdRow {
  ad_id: string;
  ad_name: string;
  advertiser_id: string;
  advertiser_name: string;
  campaign_id: string;
  campaign_name: string;
  adgroup_name: string;
  spend: number;
  impressions: number;
  reach: number;
  video_views: number;
  video_watched_2s: number;
  video_watched_6s: number;
  video_view_p50: number;
  video_view_p100: number;
  likes: number;
  comments: number;
  shares: number;
  follows: number;
  clicks: number;
  view_2s_rate: number;
  view_6s_rate: number;
  view_50_rate: number;
  view_100_rate: number;
  ctr: number;
  cpc: number;
  quadrant: "Star" | "Opportunity" | "Waste" | "Low Priority";
  video_cover_url: string | null;
  video_link: string | null; // Spark Ads have no thumbnail — link to the real video instead
}

// One metric of a post: its total, and how that total divides.
//   paid    null = no ad ever ran on this post (not the same as an ad that
//                  ran and delivered nothing)
//   organic null = no organic figure available, i.e. the paid-only fallback
interface MetricSplit {
  total: number;
  paid: number | null;
  organic: number | null;
}

interface BestVideo {
  // One row per POST, not per ad — a video boosted by three ads is one row.
  item_id: string;
  video_cover_url: string | null;
  video_link: string | null;
  caption: string | null;
  create_time: string | null;
  views: MetricSplit;
  likes: MetricSplit;
  shares: MetricSplit;
  comments: MetricSplit;
}

interface AgePerformance {
  group: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  video_views: number;
  // Watch-depth funnel. Counts are people; rates are each count as a share of
  // that age group's video_views (one shared denominator, so the four only
  // ever narrow) — computed server-side in app/api/tiktok/dashboard/route.ts.
  watched_2s: number;
  watched_6s: number;
  views_p50: number;
  views_p100: number;
  rate_2s: number;
  rate_6s: number;
  rate_p50: number;
  rate_p100: number;
}

interface InterestRow {
  category: string;
  percentage: number;
  // Percentage points above or below the average across the categories.
  // The raw percentages sit between ~82% and ~98%, so this is what
  // actually distinguishes them.
  vs_average: number;
}

interface Totals {
  spend: number;
  impressions: number;
  reach: number;
  video_views: number;
  video_watched_2s: number;
  video_watched_6s: number;
  video_view_p50: number;
  video_view_p100: number;
  likes: number;
  comments: number;
  shares: number;
  follows: number;
  clicks: number;
  cpm: number;
  cpc: number;
  avg_watch_time: number;
  view_50_rate: number;
}

interface MomChange {
  spend: number | null;
  impressions: number | null;
  video_views: number | null;
  view_50_rate: number | null;
  avg_watch_time: number | null;
  cpm: number | null;
  cpc: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  follows: number | null;
}

interface QuadrantThresholds {
  spend_threshold: number;
  rate_threshold: number;
  is_custom: boolean;
}

interface DashboardData {
  totals: Totals;
  prev_totals: Totals;
  prev_video_count: number;
  mom_change: MomChange;
  quadrant_thresholds: QuadrantThresholds;
  last_success_at: string | null;
  by_ad: AdRow[];
  advertisers: Advertiser[];
  daily_timeline: { date: string; videos: number; likes: number; follows: number }[];
  videos_daily: {
    date: string;
    total: number;
    views2s: number;
    views6s: number;
    views50pct: number;
    views100pct: number;
  }[];
  weekly_engagement: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number };
  timing_heatmap: {
    weekday: string;
    hour: number;
    engagement_rate: number;
    // F18: every campaign with engagement > 0, sorted by engagement, that made up this cell —
    // lets the hover say *who* drove it instead of just the account total.
    top_campaigns: {
      campaign_name: string;
      engagement_rate: number;
      // Per-ad (video) split of this campaign in the cell, engagement > 0 only.
      videos: { ad_name: string; caption: string | null; video_link: string | null; engagement_rate: number }[];
    }[];
  }[];
  profile_metrics: {
    followers: number | null;
    new_followers: number | null;
    profile_views: number | null;
    // Account-wide (paid + organic), independent of totals.video_views
    // which is paid-only from tiktok_ads_rawdata.
    video_views: number | null;
    engagement_rate: number | null;
    snapshot_date: string | null;
    // Same-length window immediately before the selected range. null when
    // there is nothing to compare against — the tiles then leave the
    // comparison off rather than reporting a change measured from zero.
    prev_profile_views: number | null;
    prev_followers: number | null;
    prev_new_followers: number | null;
    prev_video_views: number | null;
  };
  cost_distribution: Record<string, number>;
  cost_distribution_other_objectives: string[]; // raw objective_type values inside "Other" — for diagnosing why it dominates
  audience_gender: { male: number; female: number };
  audience_age: { group: string; percentage: number }[];
  audience_age_performance: AgePerformance[];
  audience_provinces: { province_id: string; province_name: string; percentage: number }[];
  audience_interests: InterestRow[];
  interest_average: number;
  audience_occupations: { occupation: string; percentage: number }[]; // F12, unverified dimension
  restricted_metrics: string[]; // EC4: report metrics blocked by permission_denied
  // "api_deduped" = TikTok deduplicated Reach for this exact range (the
  // normal case). "summed_fallback" = the live call failed (rate limit,
  // permission, network) and Reach fell back to summing per-ad per-day
  // rows, which counts the same person once per ad per day — a materially
  // different, inflated number with no visual difference on the tile
  // itself. Computed since the day Reach was made live but never wired
  // into the UI, so a fallback happening was invisible.
  reach_source: "api_deduped" | "summed_fallback";
  best_videos: BestVideo[];
  // Summed across every post the organic sync knows about, not just the
  // top 10 in best_videos. null when there's no organic data at all.
  video_engagement_summary: {
    post_count: number;
    prev_post_count: number;
    views: MetricSplit;
    likes: MetricSplit;
    shares: MetricSplit;
    comments: MetricSplit;
  } | null;
}

type SelectOption = { value: string; label: string };

type TabKey = "overview" | "audience" | "videos" | "quadrant";

// Interest Alignment works. Both problems that had it written off turned
// out to be ours, not TikTok's:
//
//   Names — /tool/interest_category/ takes a version parameter that was
//   never sent, defaulting to 2 (the targeting tree, 2-11 digit ids).
//   version=1 is a different taxonomy and does contain the AUDIENCE
//   report's "101"-"119" ids. See fetchInterestCategoryNames.
//
//   The suspiciously flat ~6.0-6.8% spread was read as TikTok not
//   differentiating this account. It was a wrong denominator: interest
//   categories overlap, so summing them and dividing by that sum pins
//   every category at ~1/15 by construction. Percentages are now against
//   the account's own impressions and sum past 100%, the way TikTok's own
//   Audience Insights reports them.
const SHOW_INTEREST_ALIGNMENT = true;

// F12 Top Occupation — confirmed dead, not just unverified: TikTok rejects
// the dimension outright (tiktok_error_log: "Invalid value for dimensions:
// occupation is not supported."), live-tested, zero rows ever written.
// Sync stopped requesting it (see app/api/tiktok/sync/route.ts) — same
// class of gap as F14 Profile Views (no TikTok API exposes this at all).
const SHOW_OCCUPATION = false;

type ViewRateMode = "view_2s_rate" | "view_6s_rate" | "view_50_rate" | "view_100_rate";

// One card style, everywhere a section needs to read as a card against the
// gray-100 page background — every DashboardSection, the top KPI block, and
// the empty/loading-state panels all share this exact class string so no
// section is ever left with a lighter/fainter card than its neighbors.
// Tailwind's named shadow-sm/md/lg keep the same low, fixed opacity at every
// size — bumping the size alone (sm→lg) barely reads as "darker". Arbitrary
// values here control opacity directly instead.
//
// Squared back off from rounded-3xl/2xl to rounded-lg — more corporate
// report, less rounded consumer-app card — with the shadow strengthened to
// carry the depth that the roundness used to.  Colors unchanged on purpose.
const SECTION_CARD =
  "bg-white border border-gray-300 rounded-lg shadow-[0_2px_14px_rgba(0,0,0,0.14)] p-5";
// Individual metric tiles (KpiTile, Scorecard) sit inside a SECTION_CARD —
// gray-50 against the card's white keeps each one a visibly separate
// "sub-card" instead of blending into the white it sits on.
const TILE_CARD =
  "bg-gray-50 border border-gray-300 rounded-lg shadow-[0_1px_8px_rgba(0,0,0,0.12)] p-3";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtCurrency(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Age performance table columns ─────────────────────────────────────────
const agePerformanceColumns: ColumnDef<AgePerformance>[] = [
  { accessorKey: "group", header: "Age", cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span> },
  { accessorKey: "spend", header: "Cost", cell: ({ getValue }) => fmtCurrency(getValue<number>()), meta: { align: "right" } },
  { accessorKey: "impressions", header: "Impressions", cell: ({ getValue }) => fmt(getValue<number>()), meta: { align: "right" } },
  { accessorKey: "clicks", header: "Clicks", cell: ({ getValue }) => fmt(getValue<number>()), meta: { align: "right" } },
  { accessorKey: "ctr", header: "CTR", cell: ({ getValue }) => `${getValue<number>().toFixed(2)}%`, meta: { align: "right" } },
  { accessorKey: "cpc", header: "CPC", cell: ({ getValue }) => fmtCurrency(getValue<number>()), meta: { align: "right" } },
  { accessorKey: "video_views", header: "Video Views", cell: ({ getValue }) => fmt(getValue<number>()), meta: { align: "right" } },
  ...([
    ["watched_2s", "rate_2s", "2s"],
    ["watched_6s", "rate_6s", "6s"],
    ["views_p50", "rate_p50", "50%"],
    ["views_p100", "rate_p100", "100%"],
  ] as const).map(([countKey, rateKey, label]) => ({
    // Sort on the rate, not the count: the whole point of these columns is
    // comparing engagement quality between age groups, and the raw count just
    // re-sorts by group size (which the Video Views column already does).
    id: countKey,
    accessorKey: rateKey,
    header: label,
    meta: { align: "right" as const },
    cell: ({ row }: { row: { original: AgePerformance } }) => {
      const r = row.original;
      return (
        <div className="leading-tight">
          <div>{fmt(r[countKey])}</div>
          <div className="text-[10px] text-gray-500">{r[rateKey].toFixed(1)}%</div>
        </div>
      );
    },
  })),
];

// Client-side safety net for province_id → name, restored after a live bug
// report: the backend's /tool/region/ lookup only ever covers a subset of
// Thai provinces (this exact 33-entry set, confirmed live) — any province_id
// outside it stays an unresolved numeric code from the backend (see
// app/api/tiktok/dashboard/route.ts's `p.name || p.id` fallback), and rows
// synced before the backend's cache-merge fix (see sync/route.ts) won't
// resolve until their next sync either way. A province name is never purely
// numeric, so `looksUnresolved` safely detects "backend gave up and sent
// the raw id back" without needing any extra signal from the API response.
const TIKTOK_PROVINCE_NAMES: Record<string, string> = {
  "1608528": "Nakhon Ratchasima",
  "1906691": "Sa Kaeo",
  "1152221": "Mae Hong Son",
  "1150514": "Surat Thani",
  "1607707": "Phitsanulok",
  "1153670": "Chiang Mai",
  "1611268": "Chanthaburi",
  "1150953": "Ratchaburi",
  "1608408": "Narathiwat",
  "1606585": "Samut Songkhram",
  "1149965": "Uthai Thani",
  "1153089": "Kamphaeng Phet",
  "1611406": "Chaiyaphum",
  "1605277": "Trat",
  "1150006": "Trang",
  "1611452": "Buri Ram",
  "1150532": "Sukhothai",
  "1607976": "Pattani",
  "1153080": "Kanchanaburi",
  "1608595": "Mukdahan",
  "1606032": "Suphan Buri",
  "1608526": "Nakhon Sawan",
  "1151253": "Phuket",
  "1606417": "Saraburi",
  "1611438": "Chachoengsao",
  "1151073": "Prachuap Khiri Khan",
  "1609070": "Loei",
  "1151416": "Phetchaburi",
  "1607736": "Phetchabun",
  "1608533": "Nakhon Pathom",
  "1609775": "Khon Kaen",
  "1607982": "Pathum Thani",
  "1606587": "Samut Sakhon",
};

function provinceName(id: string, backendName: string): string {
  const looksUnresolved = /^\d+$/.test(backendName);
  if (!looksUnresolved) return backendName;
  return TIKTOK_PROVINCE_NAMES[id] ?? backendName;
}

// ─── Province table columns ────────────────────────────────────────────────
type ProvinceRow = { province_id: string; province_name: string; percentage: number };
const provinceColumns: ColumnDef<ProvinceRow>[] = [
  {
    id: "province",
    header: "จังหวัด",
    accessorFn: (p) => provinceName(p.province_id, p.province_name),
  },
  { accessorKey: "percentage", header: "%", cell: ({ getValue }) => `${getValue<number>().toFixed(1)}%`, meta: { align: "right" } },
  {
    id: "bar",
    header: "สัดส่วน",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden min-w-28">
        <div className="h-full rounded-full bg-[#1a2b4a]" style={{ width: `${Math.min(100, row.original.percentage)}%` }} />
      </div>
    ),
  },
];

function quadrantColor(q: string) {
  switch (q) {
    case "Star":
      return "bg-green-100 text-black border-green-300";
    case "Opportunity":
      return "bg-blue-100 text-black border-blue-300";
    case "Waste":
      return "bg-red-100 text-black border-red-300";
    default:
      return "bg-gray-100 text-black border-gray-200";
  }
}

// EC6: a thumbnail whose underlying video/ad TikTok has since removed 404s
// when the browser tries to load it — swap to a labeled placeholder instead
// of a broken-image icon. Historical DB row (and its old cover URL) is never
// deleted; this only changes what renders when that URL stops resolving.
function AdThumbnail({ src, className, onClick }: { src: string; className: string; onClick?: () => void }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className={`${className} bg-gray-100 flex items-center justify-center text-center px-1`} title="วิดีโอนี้อาจถูกลบจาก TikTok แล้ว">
        <span className="text-[9px] text-gray-400 leading-tight">Ad unavailable</span>
      </div>
    );
  }
  return <img src={src} alt="" className={className} onClick={onClick} onError={() => setBroken(true)} />;
}

// ─── Per-section date override ─────────────────────────────────────────────
// Every section follows the page's global date filter by default. Any section
// can be given its own range; only that section then refetches and re-renders,
// while the rest of the page keeps showing the global range.
//
// This deliberately reuses the existing /api/tiktok/dashboard endpoint instead
// of adding per-section ones: its response already contains every section's
// data, so an override just re-reads the field that section cares about. The
// cost is one extra query per *actively overridden* section — the same work
// the page already does whenever the global filter changes — which keeps the
// backend completely untouched. If overrides ever turn out to be slow in
// practice, the fix is a `sections=` param on that route to skip the blocks a
// section doesn't read, not a new endpoint.
//
// ponytail: one full dashboard query per overridden section; add `sections=`
// gating to the route if that ever shows up as a real latency problem.
interface SectionRange {
  from: string;
  to: string;
  isOverridden: boolean;
  loading: boolean;
  error: string | null;
  /** This section's own data while overridden; null means "follow the global filter". */
  data: DashboardData | null;
  set: (from: string, to: string) => void;
  reset: () => void;
}

function useSectionRange(globalFrom: string, globalTo: string, advertiserIds: string): SectionRange {
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  // Results are stored together with the request they answer. Two things fall
  // out of that for free: clearing an override needs no state write at all
  // (`key` stops matching), and a section can never render numbers belonging
  // to a range the user has already moved on from.
  const [result, setResult] = useState<{ key: string; data?: DashboardData; error?: string } | null>(null);

  const key = range ? `${range.from}|${range.to}|${advertiserIds}` : "";

  useEffect(() => {
    if (!key || !range) return;
    // The user can change a date faster than the query returns, so a stale
    // response must never overwrite a newer one.
    let cancelled = false;
    const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
    if (advertiserIds) params.set("advertiser_id", advertiserIds);
    fetch(`/api/tiktok/dashboard?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "เกิดข้อผิดพลาด");
        if (!cancelled) setResult({ key, data: json });
      })
      .catch((err) => {
        if (!cancelled) setResult({ key, error: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" });
      });
    return () => {
      cancelled = true;
    };
    // `range` is covered by `key`, which is derived from it.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = result?.key === key ? result : null;

  return {
    from: range?.from ?? globalFrom,
    to: range?.to ?? globalTo,
    isOverridden: range !== null,
    // Derived, not stored: an override with no matching result yet IS the
    // loading state. Keeping it as state would mean a synchronous setState in
    // the effect above, and another way for the two to drift apart.
    loading: range !== null && current === null,
    error: current?.error ?? null,
    data: current?.data ?? null,
    set: (from, to) => setRange({ from, to }),
    reset: () => setRange(null),
  };
}

/**
 * One dashboard section: its own header, its own date filter, and the data
 * that filter resolves to.
 *
 * Sections render through this rather than each calling useSectionRange
 * themselves — a hook per section would mean repeating the same header +
 * filter + loading/fallback wiring ~15 times, and every one of those is a
 * place for the sections to drift apart. Children get the effective data as a
 * render-prop argument, so a section physically cannot read the global `data`
 * by accident and silently ignore its own filter.
 */
function DashboardSection({
  title,
  subtitle,
  globalData,
  globalFrom,
  globalTo,
  advertiserIds,
  headerExtra,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode | ((d: DashboardData) => React.ReactNode);
  globalData: DashboardData | null;
  globalFrom: string;
  globalTo: string;
  advertiserIds: string;
  /** Controls that belong to this section's header (chart toggles, etc.). */
  headerExtra?: React.ReactNode;
  children: (d: DashboardData) => React.ReactNode;
}) {
  const range = useSectionRange(globalFrom, globalTo, advertiserIds);
  const effective = range.data ?? globalData;

  return (
    // One card style for every section on the page (SECTION_CARD) — was
    // ad-hoc per call site (some wrapped their own content in a white box,
    // most didn't), so half the sections floated on the gray page background
    // with nothing to set them apart from it.
    <div className={SECTION_CARD}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-base font-semibold text-black">{title}</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {headerExtra}
          <SectionDateFilter range={range} />
        </div>
      </div>
      {effective && subtitle && (
        <p className="text-xs text-black mb-3">
          {typeof subtitle === "function" ? subtitle(effective) : subtitle}
        </p>
      )}
      {/* Keep showing the previous numbers while a new range loads — blanking
          the section makes the whole page jump on every date tweak. */}
      <div className={range.loading ? "opacity-50 transition-opacity" : undefined}>
        {effective ? children(effective) : <p className="text-xs text-gray-400">กำลังโหลด…</p>}
      </div>
    </div>
  );
}

// Chart shaping helpers. These take the DashboardData they should read rather
// than closing over the page's global `data`, so a section rendering its own
// date range gets charts built from that range instead of silently falling
// back to the global one.
function weeklyChartData(d: DashboardData) {
  const w = d.weekly_engagement;
  // Monochrome — one brand color for every bar (was a different hue per
  // day, which read as a rainbow with no meaning behind the color choice).
  return [
    { day: "จ", value: w.mon },
    { day: "อ", value: w.tue },
    { day: "พ", value: w.wed },
    { day: "พฤ", value: w.thu },
    { day: "ศ", value: w.fri },
    { day: "ส", value: w.sat },
    { day: "อา", value: w.sun },
  ];
}

// Video view funnel — 2s/6s/50%/100% strictly narrow (each a subset of the
// one before: total ≥ views2s ≥ views6s ≥ views50pct ≥ views100pct), not
// independent categories. Stacking the raw cumulative counts (the old
// "Total, 2s, 6s, 50%, 100%" bars, in that order) double-counted everyone
// who passed each stage and inflated the bar well past the real total.
// Differenced into exclusive segments instead, so the stack sums to exactly
// Total Views and each band shows where people actually dropped off — the
// requested 2s→6s→50%→100% order IS this funnel's natural order; "Total"
// no longer needs its own bar since the full stack height already is it.
//
// Sequential blue ramp (dataviz skill, references/palette.md — ordinal/
// funnel steps, light→dark; validated: validate_palette.js
// "#86b6ef,#5598e7,#2a78d6,#1c5cab,#104281" --mode light --ordinal, all
// checks pass) instead of five unrelated saturated hues — muted, and the
// light→dark order itself reads as the funnel's own progression.
const VIDEO_FUNNEL_COLORS = {
  lt2s: "#86b6ef",
  s2to6: "#5598e7",
  s6to50: "#2a78d6",
  s50to100: "#1c5cab",
  s100: "#104281",
};

// Recharts' <Tooltip> defaults to itemSorter: "name" — alphabetical by the
// Bar's `name` label, not stack/declaration order. With Thai labels
// ("ไม่ถึง 2s" etc. — Thai script sorts far from "1"/"2"/"5"/"6" in Unicode)
// that scrambled the hover list into something unrelated to the funnel.
// Explicit rank by dataKey instead, independent of whatever the labels say.
const VIDEO_FUNNEL_ORDER = ["lt2s", "s2to6", "s6to50", "s50to100", "s100"];

function videoFunnelChartData(d: DashboardData) {
  return (d.videos_daily ?? []).map((v) => ({
    date: v.date,
    lt2s: Math.max(0, v.total - v.views2s),
    s2to6: Math.max(0, v.views2s - v.views6s),
    s6to50: Math.max(0, v.views6s - v.views50pct),
    s50to100: Math.max(0, v.views50pct - v.views100pct),
    s100: v.views100pct,
  }));
}

function genderChartData(d: DashboardData) {
  return [
    { name: "ชาย", value: d.audience_gender.male, color: "#3b82f6" },
    { name: "หญิง", value: d.audience_gender.female, color: "#ec4899" },
  ];
}

function costChartData(d: DashboardData) {
  const cd = d.cost_distribution;
  const colors: Record<string, string> = {
    Reach: "#10b981",
    "Video View": "#f59e0b",
    "Community Interaction": "#8b5cf6",
    Other: "#94a3b8",
  };
  return Object.entries(cd)
    .filter(([k]) => k !== "Other" || (cd[k] ?? 0) > 0)
    .map(([name, value]) => ({ name, value, color: colors[name] ?? "#94a3b8" }));
}

/** "weekday_hour" → engagement-rate lookup for the timing heatmap grid. */
function heatmapLookup(d: DashboardData) {
  return new Map(d.timing_heatmap.map((c) => [`${c.weekday}_${c.hour}`, c]));
}

/** Busiest cell in the heatmap; floored so an all-zero grid can't divide by 0. */
function heatmapPeak(d: DashboardData) {
  return Math.max(0.01, ...d.timing_heatmap.map((c) => c.engagement_rate));
}

const HEATMAP_DAYS = [
  { key: "mon", label: "จ" }, { key: "tue", label: "อ" }, { key: "wed", label: "พ" },
  { key: "thu", label: "พฤ" }, { key: "fri", label: "ศ" }, { key: "sat", label: "ส" }, { key: "sun", label: "อา" },
] as const;

/**
 * Timing Heatmap — its own component so hover state stays local to it.
 * Was `hoveredCell` state on the page's top-level component; every mouse
 * move between the grid's 168 cells then re-rendered the *entire* dashboard
 * page — every chart, every table — which read as flicker/jank well beyond
 * just this chart. Isolated here, a hover only ever re-renders this one
 * small component.
 */
type HeatmapCellRef = { dayKey: string; dayLabel: string; hour: number };

function TimingHeatmapChart({ d }: { d: DashboardData }) {
  const grid = heatmapLookup(d);
  const peak = heatmapPeak(d);
  const [hovered, setHovered] = useState<HeatmapCellRef | null>(null);
  // Click pins a cell so the panel keeps showing it after the mouse leaves
  // — reading the breakdown without having to hold the cursor dead still,
  // and the only way this works at all on touch (no hover there). Hovering
  // a *different* cell still live-previews it (hover wins over the pin,
  // same as before); the pin itself only changes on click or on clicking
  // the same cell again to release it.
  const [pinned, setPinned] = useState<HeatmapCellRef | null>(null);
  const shown = hovered ?? pinned;
  // Looked up fresh from `grid` each render rather than stored on the ref
  // itself, so switching this section's own date range can't leave a stale
  // cell's numbers showing under the (still-correctly-highlighted) cursor.
  const shownCell = shown ? grid.get(`${shown.dayKey}_${shown.hour}`) : null;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th className="w-8" />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="text-[9px] font-normal text-gray-400 w-5">
                  {h % 3 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEATMAP_DAYS.map((day) => (
              <tr key={day.key}>
                <td className="text-xs text-black pr-1">{day.label}</td>
                {Array.from({ length: 24 }, (_, h) => {
                  const cell = grid.get(`${day.key}_${h}`);
                  const rate = cell?.engagement_rate ?? 0;
                  const intensity = rate / peak;
                  const isHovered = hovered?.dayKey === day.key && hovered?.hour === h;
                  const isPinned = pinned?.dayKey === day.key && pinned?.hour === h;
                  return (
                    <td key={h}>
                      {/* F18: which campaign(s) made up this cell — shown in
                          the fixed panel below, not a floating tooltip. A
                          tooltip positioned to escape this cell would get
                          clipped by the overflow-x-auto wrapper above (24
                          hour columns don't fit narrow screens): per the CSS
                          overflow spec, overflow-x: auto silently upgrades
                          overflow-y from its visible default to auto too.
                          outline (not a ring/box-shadow or a scale transform)
                          for the highlight — it's purely visual, doesn't grow
                          the element's hit-tested box, so it can't bleed into
                          — and steal hover from — the tightly-packed cell
                          next door (border-spacing-0.5 is 2px). Pinned gets
                          its own solid color so a pin surviving the mouse
                          moving away still reads as deliberately "on", not
                          an accidental leftover hover. */}
                      <div
                        onMouseEnter={() => setHovered({ dayKey: day.key, dayLabel: day.label, hour: h })}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setPinned(isPinned ? null : { dayKey: day.key, dayLabel: day.label, hour: h })}
                        className="w-5 h-5 rounded-[3px] cursor-pointer transition-[outline-color] duration-150 ease-out"
                        style={{
                          backgroundColor: `rgba(254,44,85,${0.08 + intensity * 0.85})`,
                          outline: "2px solid",
                          outlineColor: isPinned ? "#1a2b4a" : isHovered ? "#111827" : "transparent",
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fixed height regardless of content (long lists scroll) so settling
          into/out of hover never nudges anything else on the page. */}
      <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-xs h-40 overflow-y-auto">
        {shown ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-black">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: `rgba(254,44,85,${0.08 + (shownCell?.engagement_rate ?? 0) / peak * 0.85})` }}
                />
                {shown.dayLabel} {shown.hour}:00 — {(shownCell?.engagement_rate ?? 0).toFixed(2)}%
              </div>
              {/* Only when the shown cell IS the pin — hovering a different
                  cell previews it without disturbing the pin underneath, so
                  this stays pointing at what clicking "ล้าง" would actually
                  clear. */}
              {pinned && pinned.dayKey === shown.dayKey && pinned.hour === shown.hour && (
                <button
                  onClick={() => setPinned(null)}
                  className="shrink-0 text-[10px] text-secondary hover:underline whitespace-nowrap"
                >
                  📌 ล้าง
                </button>
              )}
            </div>
            {shownCell && shownCell.top_campaigns.length > 0 ? (
              <div className="mt-1.5 space-y-1 border-t border-gray-200 pt-1.5">
                {shownCell.top_campaigns.map((c) => (
                  <div key={c.campaign_name}>
                    <div className="flex items-center justify-between gap-3 text-gray-500">
                      <span className="truncate">{c.campaign_name}</span>
                      <span className="font-medium text-black shrink-0">{c.engagement_rate.toFixed(2)}%</span>
                    </div>
                    {c.videos.map((v) => {
                      const label = v.caption || v.ad_name;
                      return (
                        <div key={v.ad_name} className="flex items-center justify-between gap-3 pl-4 text-gray-400">
                          {v.video_link ? (
                            <a href={v.video_link} target="_blank" rel="noreferrer" className="truncate hover:underline text-secondary">
                              🎬 {label}
                            </a>
                          ) : (
                            <span className="truncate">🎬 {label}</span>
                          )}
                          <span className="shrink-0">{v.engagement_rate.toFixed(2)}%</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 mt-1">ไม่มีข้อมูลระดับ campaign สำหรับ cell นี้</p>
            )}
          </>
        ) : (
          <p className="text-gray-400">วางเมาส์หรือคลิก cell เพื่อดู engagement rate และ campaign ที่ทำให้เกิดยอดนี้ — คลิกเพื่อปักหมุดไว้</p>
        )}
      </div>
    </div>
  );
}

/**
 * Thailand province choropleth. h-full (not a fixed height) so this stretches
 * to match its sibling in the grid row beside it (the province table) — CSS
 * Grid's default align-items: stretch already makes every item in a row the
 * height of the tallest one; a fixed height here was fighting that.
 *
 * Real zoom/pan now (chartjs-plugin-zoom — wheel to zoom, drag to pan), not
 * a fullscreen toggle — ThaiGeoChart owns the zoom config; "Reset zoom"
 * here just calls the chart's own resetZoom().
 */
function ThaiMapCard({ regions }: { regions: { region: string; value: number }[] }) {
  const chartApiRef = useRef<{ resetZoom: () => void } | null>(null);
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 h-full min-h-105 flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <p className="text-[11px] text-gray-400">เลื่อนสกรอลล์ = ซูม · ลากค้าง = เลื่อนแผนที่</p>
        <button
          onClick={() => chartApiRef.current?.resetZoom()}
          className="text-xs bg-white border border-gray-300 rounded-lg px-2 py-1 shadow-sm hover:bg-gray-50 text-black"
        >
          ↺ Reset zoom
        </button>
      </div>
      {regions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          ยังไม่มีข้อมูลจังหวัด — ลอง Sync Data
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ThaiGeoChart regions={regions} apiRef={chartApiRef} />
        </div>
      )}
    </div>
  );
}

/** Ads scoped by the page's Campaign / Ad Group dropdowns. */
function scopeAds(d: DashboardData, campaign: SelectOption | null, adgroup: SelectOption | null) {
  return d.by_ad.filter(
    (r) =>
      (!campaign || r.campaign_name === campaign.value) &&
      (!adgroup || r.adgroup_name === adgroup.value),
  );
}

/**
 * Everything the Quadrant scatter needs, derived in one place.
 *
 * Was six chained useMemos reading the page's global `data`; collapsed into a
 * pure function so the section can build the same view from whatever date
 * range it is showing. The chain (points → thresholds → bounds → outliers) has
 * to stay in this order, which is exactly why it belongs in one function
 * rather than six separately-memoised values that can each drift.
 */
function buildQuadrantView(
  d: DashboardData,
  campaign: SelectOption | null,
  adgroup: SelectOption | null,
  yAxisMode: ViewRateMode,
) {
  const scoped = scopeAds(d, campaign, adgroup);
  const points = scoped
    .filter((r) => r.video_views > 0 && r.spend > 0)
    .map((r) => ({
      adId: r.ad_id,
      adName: r.ad_name || r.ad_id,
      spend: r.spend,
      view_2s_rate: r.view_2s_rate,
      view_6s_rate: r.view_6s_rate,
      view_50_rate: r.view_50_rate,
      view_100_rate: r.view_100_rate,
      quadrant: r.quadrant,
      videoCoverUrl: r.video_cover_url, // real image — for the hover preview
      videoLink: r.video_link, // watchable page (Spark Ads' TikTok embed) — for click-through
    }));

  // For "50% Rate" mode these are the *actual* Star/Opportunity/Waste
  // boundaries (F17, set server-side); other Y-axis display modes only get a
  // soft visual guide, since classification is always Spend × 50% View Rate.
  const onClassifyingAxis = yAxisMode === "view_50_rate";
  const xThreshold = onClassifyingAxis
    ? d.quadrant_thresholds.spend_threshold
    : points.length === 0
      ? 0
      : Math.max(...points.map((p) => p.spend)) / 2;
  const yThreshold = onClassifyingAxis
    ? d.quadrant_thresholds.rate_threshold
    : points.length === 0
      ? 0
      : Math.max(...points.map((p) => p[yAxisMode] as number)) / 2;

  // Outer bounds are always exactly 2× the threshold so the dividing cross
  // sits dead center (letting outliers stretch the domain pushed it off
  // center). Trade-off: an ad past 2× has no visible dot — `outliers` surfaces
  // that instead of silently dropping it.
  const maxX = xThreshold * 2 * 1.05;
  const maxY = yThreshold * 2 * 1.05;
  const outliers = points.filter(
    (p) => p.spend > maxX || (p[yAxisMode] as number) > maxY,
  ).length;

  return { scoped, points, xThreshold, yThreshold, maxX, maxY, outliers };
}

type QuadrantPoint = ReturnType<typeof buildQuadrantView>["points"][number];

/** Compact date-range control rendered in a section's header. */
function SectionDateFilter({ range }: { range: SectionRange }) {
  const input =
    "border border-gray-300 rounded-lg px-2 py-1 pr-6 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-primary";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {range.isOverridden && (
        <span className="text-[10px] font-medium text-secondary bg-secondary/10 px-1.5 py-0.5 rounded" title="ช่วงวันที่ของ section นี้ไม่ตรงกับตัวกรองหลัก">
          ช่วงวันที่เฉพาะ
        </span>
      )}
      <DateInput
        value={range.from}
        max={range.to || undefined}
        onChange={(from) => range.set(from, range.to)}
        className={input}
        aria-label="ตั้งแต่วันที่"
      />
      <span className="text-xs text-gray-400">–</span>
      <DateInput
        value={range.to}
        min={range.from || undefined}
        onChange={(to) => range.set(range.from, to)}
        className={input}
        aria-label="ถึงวันที่"
      />
      {range.isOverridden && (
        <button
          onClick={range.reset}
          className="text-xs text-gray-500 hover:text-black underline whitespace-nowrap"
        >
          ใช้ตัวกรองหลัก
        </button>
      )}
      {range.loading && <span className="text-xs text-gray-400">กำลังโหลด…</span>}
      {range.error && <span className="text-xs text-red-600">{range.error}</span>}
    </div>
  );
}

// ─── Ad Detail table columns ───────────────────────────────────────────────
const adTableColumns: ColumnDef<AdRow>[] = [
  {
    id: "ad",
    header: "Ad",
    accessorFn: (row) => row.ad_name || row.ad_id,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex items-center gap-3">
          {r.video_cover_url ? (
            <AdThumbnail
              src={r.video_cover_url}
              className="w-12 h-16 object-cover rounded cursor-pointer shrink-0"
              // เดิมเปิด video_cover_url (แค่รูป cover เฉย ๆ) ตอนคลิก — ที่ถูกคือ
              // เปิดวิดีโอจริงบน TikTok (video_link) ถ้ามี มี fallback ไปที่รูป
              // cover เฉพาะตอนไม่มี video_link จริง ๆ (โฆษณาที่ไม่ใช่ Spark Ad
              // อัปโหลดตรงผ่าน Ads Manager มักไม่มีหน้า TikTok สาธารณะให้ลิงก์ไป)
              onClick={() => window.open(r.video_link ?? r.video_cover_url!, "_blank")}
            />
          ) : r.video_link ? (
            <a
              href={r.video_link}
              target="_blank"
              rel="noreferrer"
              className="w-12 h-16 bg-gray-900 rounded flex items-center justify-center text-white text-xl hover:bg-gray-700 shrink-0"
              title="Spark Ad — ไม่มี thumbnail, กดดูวิดีโอจริง"
            >
              ▶
            </a>
          ) : (
            <div className="w-12 h-16 bg-gray-100 rounded shrink-0" />
          )}
          <div>
            <p className="font-medium text-black truncate max-w-40">{r.ad_name || r.ad_id}</p>
            <p className="text-xs text-black truncate max-w-40">{r.campaign_name}</p>
          </div>
        </div>
      );
    },
  },
  { accessorKey: "adgroup_name", header: "Ad Group" },
  {
    accessorKey: "campaign_id",
    header: "Campaign ID",
    cell: ({ getValue }) => <span className="text-xs text-black">{getValue<string>() || "—"}</span>,
  },
  { accessorKey: "advertiser_name", header: "Advertiser" },
  { accessorKey: "impressions", header: "Impressions", cell: ({ getValue }) => fmt(getValue<number>()), meta: { align: "right" } },
  { accessorKey: "reach", header: "Reach", cell: ({ getValue }) => fmt(getValue<number>()), meta: { align: "right" } },
  {
    id: "frequency",
    header: "Frequency",
    accessorFn: (r) => (r.reach > 0 ? r.impressions / r.reach : 0),
    cell: ({ row }) => (row.original.reach > 0 ? (row.original.impressions / row.original.reach).toFixed(2) : "—"),
    meta: { align: "right" },
  },
  { accessorKey: "clicks", header: "Clicks", cell: ({ getValue }) => fmt(getValue<number>()), meta: { align: "right" } },
  // Cost moved out from between Video Views and 6s Video Views — grouped
  // here with the other delivery/spend columns (Impressions, Reach,
  // Frequency, Clicks) so the video-performance columns that follow read as
  // one uninterrupted block instead of being split by an unrelated metric.
  { accessorKey: "spend", header: "Cost", cell: ({ getValue }) => fmtCurrency(getValue<number>()), meta: { align: "right" } },
  { accessorKey: "video_views", header: "Video Views", cell: ({ getValue }) => fmt(getValue<number>()), meta: { align: "right" } },
  { accessorKey: "video_watched_6s", header: "6s Video Views", cell: ({ getValue }) => fmt(getValue<number>()), meta: { align: "right" } },
  {
    accessorKey: "view_2s_rate",
    header: "2s Rate",
    cell: ({ getValue }) => <span className="font-semibold">{getValue<number>().toFixed(1)}%</span>,
    meta: { align: "right" },
  },
  {
    accessorKey: "view_50_rate",
    header: "50% Rate",
    cell: ({ getValue }) => <span className="font-semibold">{getValue<number>().toFixed(1)}%</span>,
    meta: { align: "right" },
  },
  {
    accessorKey: "view_100_rate",
    header: "100% Rate",
    cell: ({ getValue }) => <span className="font-semibold">{getValue<number>().toFixed(1)}%</span>,
    meta: { align: "right" },
  },
  {
    accessorKey: "quadrant",
    header: "Quadrant",
    cell: ({ getValue }) => {
      const q = getValue<string>();
      return (
        <span className={`inline-block border text-xs font-semibold px-2 py-0.5 rounded-full ${quadrantColor(q)}`}>
          {q}
        </span>
      );
    },
    meta: { align: "center" },
  },
];

// ─── Best Videos table columns ──────────────────────────────────────────────
/**
 * One Best Videos metric in a single column: the total in bold, with the
 * paid and organic halves under it. Four columns of three lines beat twelve
 * columns of one — the table stays readable and each metric's split reads
 * as a unit instead of three numbers the eye has to pair up again.
 *
 * Sorting uses the total, which is the figure the ranking is about.
 */
function splitColumn(key: "views" | "likes" | "shares" | "comments", header: string): ColumnDef<BestVideo> {
  return {
    id: key,
    header,
    accessorFn: (v) => v[key].total,
    cell: ({ row }) => {
      const m = row.original[key];
      const part = (n: number | null) =>
        n == null ? <span className="text-gray-400">—</span> : n < 0 ? `−${fmt(Math.abs(n))}` : fmt(n);
      return (
        <div className="text-right leading-tight">
          <div className="font-semibold">{fmt(m.total)}</div>
          <div className="text-[11px] text-gray-500">
            <span className="text-gray-400">(ads)</span> {part(m.paid)}
          </div>
          <div className="text-[11px] text-gray-500">
            <span className="text-gray-400">(Organic)</span> {part(m.organic)}
          </div>
        </div>
      );
    },
    meta: { align: "right" },
  };
}

const bestVideosColumns: ColumnDef<BestVideo>[] = [
  {
    id: "preview",
    header: "Preview",
    enableSorting: false,
    cell: ({ row }) => {
      const v = row.original;
      return v.video_cover_url ? (
        <AdThumbnail
          src={v.video_cover_url}
          className="w-20 h-28 object-cover rounded cursor-pointer"
          onClick={() => window.open(v.video_link ?? v.video_cover_url!, "_blank")}
        />
      ) : v.video_link ? (
        <a
          href={v.video_link}
          target="_blank"
          rel="noreferrer"
          className="w-20 h-28 bg-gray-900 rounded flex items-center justify-center text-white text-2xl hover:bg-gray-700"
          title="Spark Ad — ไม่มี thumbnail, กดดูวิดีโอจริง"
        >
          ▶
        </a>
      ) : (
        <div className="w-20 h-28 bg-gray-100 rounded" />
      );
    },
  },
  {
    id: "caption",
    header: "Caption",
    accessorFn: (v) => v.caption || v.item_id || "—",
    cell: ({ getValue }) => <span className="max-w-60 truncate block">{getValue<string>()}</span>,
  },
  {
    accessorKey: "create_time",
    header: "Create Time",
    cell: ({ getValue }) => {
      const v = getValue<string | null>();
      return <span className="text-xs">{v ? new Date(v).toLocaleDateString("th-TH") : "—"}</span>;
    },
  },
  splitColumn("views", "Views"),
  splitColumn("likes", "Likes"),
  splitColumn("shares", "Shares"),
  splitColumn("comments", "Comments"),
];

function defaultDateRange() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 1);
  const start = new Date(today);
  start.setDate(start.getDate() - 30);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

// ─── Info dot — hover explanation for a metric label ──────────────────────
// ─── Scorecard — flat, no card chrome: label / big number / thin-ruled delta ──

function Scorecard({
  label,
  value,
  sub,
  change,
}: {
  label: string;
  value: string;
  sub?: string;
  change?: number | null;
}) {
  return (
    <div className={TILE_CARD}>
      <div className="flex items-center gap-1 mb-1">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-black mb-1.5">{value}</p>
      {(sub || change != null) && (
        <div className="flex items-center gap-2 pt-1.5 text-xs">
          {change != null && (
            <span className={`font-semibold ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
            </span>
          )}
          {sub && <span className="text-gray-400">{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ─── KPI Tile — flat, no card chrome: label / big number / thin-ruled delta ───
// Was a colored box per tile (Looker Studio mockup); restyled flat to match
// the plain-column reference design — same props, same data, new skin.

function KpiTile({
  label,
  value,
  thisMonth,
  lastMonth,
  scope,
  breakdown,
}: {
  label: string;
  value: string;
  thisMonth?: { text: string; up: boolean } | null;
  lastMonth?: string | null;
  // Set on the few tiles that are NOT paid-only. Almost everything on this
  // page comes from tiktok_ads_rawdata and describes advertising alone; two
  // tiles describe the whole TikTok account, organic included, and they sit
  // in the same rows looking identical. "New followers" (paid follows) next
  // to "followers" (the account's total) is the pair that misleads most.
  scope?: string;
  // Extra label/value rows under the number, rendered like the month
  // comparison. Used where a tile's headline figure is made of parts the
  // reader needs — paid versus organic — rather than a single source.
  breakdown?: { label: string; value: string }[];
}) {
  return (
    <div className={TILE_CARD}>
      <div className="flex items-center gap-1 mb-1">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        {scope && <span className="text-[10px] text-gray-400">({scope})</span>}
      </div>
      <p className="text-2xl font-bold text-black mb-1.5">{value}</p>
      {breakdown && breakdown.length > 0 && (
        <div className="space-y-0.5 text-xs pt-1.5 mb-1">
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-center justify-between gap-2">
              <span className="text-gray-400">{b.label}</span>
              <span className="font-semibold text-black">{b.value}</span>
            </div>
          ))}
        </div>
      )}
      {(thisMonth || lastMonth != null) && (
        <div className={`flex items-center gap-1.5 text-xs ${breakdown && breakdown.length > 0 ? "" : " pt-1.5"}`}>
          {thisMonth && (
            <span className={`font-semibold ${thisMonth.up ? "text-green-600" : "text-red-600"}`}>
              {thisMonth.up ? "▲" : "▼"} {thisMonth.text}
            </span>
          )}
          {lastMonth != null && <span className="text-gray-400">prev {lastMonth}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Section band — flat uppercase group label (replaces the old h3s) ────────
function SectionBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5">
      <p className="text-[14px] font-bold tracking-widest text-gray-800 uppercase">{children}</p>
    </div>
  );
}

// ─── Hero — the one figure the whole page is about, full-width and dark ──────
function HeroSpend({
  spend,
  prevSpend,
  monthLabel,
  asOf,
}: {
  spend: number;
  prevSpend: number | null;
  monthLabel: string;
  asOf: string | null;
}) {
  return (
    <div className="bg-black rounded-lg shadow-[0_4px_18px_rgba(0,0,0,0.3)] px-6 py-5 flex items-center justify-between flex-wrap gap-4">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-xs text-white/50">Total Spend · {monthLabel}</p>
        </div>
        <p className="text-3xl font-bold text-white">{fmtCurrency(spend)}</p>
        {asOf && <p className="text-xs text-white/40 mt-1">ข้อมูล ณ {asOf}</p>}
      </div>
      <div className="text-xs space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="text-white/50">This Month</span>
          <span className="font-semibold text-primary">{fmtCurrency(spend)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-white/50">Last Month</span>
          <span className="font-semibold text-white">{prevSpend != null && prevSpend > 0 ? fmtCurrency(prevSpend) : "—"}</span>
        </div>
      </div>
    </div>
  );
}

/** "August 2026", or "Aug 2026 – Sep 2026" when the range spans more than one month. */
function rangeMonthLabel(dateFrom: string, dateTo: string): string {
  if (!dateFrom || !dateTo) return "";
  const a = new Date(dateFrom);
  const b = new Date(dateTo);
  const long = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const la = long(a);
  const lb = long(b);
  return la === lb ? la : `${short(a)} – ${short(b)}`;
}

/** Delta row for a KpiTile: current vs previous, formatted with fmtFn. */
function deltaOf(curr: number, prev: number, fmtFn: (n: number) => string): { text: string; up: boolean } {
  const diff = curr - prev;
  return { text: fmtFn(Math.abs(diff)), up: diff >= 0 };
}

/**
 * Percent change for the Scorecard change prop. null whenever there is
 * nothing meaningful to divide by — a previous period of 0, or a figure
 * missing on either side — so the card shows no comparison rather than an
 * infinite or invented one.
 */
function pctChangeOf(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// AC8: quadrant-filter click syncs to `?quadrant=` — page.tsx now reads
// useSearchParams(), which Next.js requires a Suspense boundary for.
export default function TikTokDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100 flex items-center justify-center text-gray-400 text-sm">กำลังโหลด…</div>}>
      <TikTokDashboardPageInner />
    </Suspense>
  );
}

function TikTokDashboardPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const defaultRange = defaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [selectedAdvertisers, setSelectedAdvertisers] = useState<SelectOption[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // F05/F24/EC5/EC8/EC9/EC10/AC5/AC6/AC13: one poll covers connection state,
  // live sync progress, and how long a non-auth outage has been going.
  type StatusInfo = {
    connected: boolean;
    syncing: boolean;
    progress: { completed: number; total: number | null } | null;
    status_detail: string | null;
    outage_minutes: number | null;
    consecutive_failures: number;
  };
  const [statusInfo, setStatusInfo] = useState<StatusInfo>({
    connected: true, // assume OK until status says otherwise
    syncing: false,
    progress: null,
    status_detail: null,
    outage_minutes: null,
    consecutive_failures: 0,
  });
  const connected = statusInfo.connected;

  // AC10: role — same check as the Facebook /dashboard page
  // (currentUser?.role === "admin"). "user" role = read-only Viewer here:
  // Settings (quadrant threshold edit, Sync/Settings page) and Export stay
  // admin-only; everything else on this page is visible to both. Also
  // drives which nav renders below (AdminNav vs UserNav — same username +
  // Logout every other page has).
  const [currentUser, setCurrentUser] = useState<{ username: string; display_name?: string | null; role?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    fetch("/api/user/auth")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCurrentUser(d?.user ?? null))
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);
  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch("/api/tiktok/status")
        .then((r) => r.json())
        .then((s) => {
          if (cancelled) return;
          setStatusInfo({
            connected: s.connected !== false,
            syncing: !!s.syncing,
            progress: s.progress ?? null,
            status_detail: s.status_detail ?? null,
            outage_minutes: s.outage_minutes ?? null,
            consecutive_failures: s.consecutive_failures ?? 0,
          });
        })
        .catch(() => {}); // status check failing shouldn't itself show a false banner
    };
    poll();
    // EC5/EC9/AC13: only worth polling fast while something is actually
    // running/mid-progress — 8s keeps the progress bar/lock feeling live
    // without hammering the endpoint the rest of the time.
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Chart 1: Timeline metric toggles
  const [showVideos, setShowVideos] = useState(true);
  const [showLikes, setShowLikes] = useState(true);
  const [showFollows, setShowFollows] = useState(true);

  // Chart 7: Stacked video view funnel toggles — one per exclusive segment,
  // see videoFunnelChartData's comment for why these replaced the old
  // Total/2s/6s/50%/100% cumulative-count bars.
  const [showSegLt2s, setShowSegLt2s] = useState(true);
  const [showSeg2to6, setShowSeg2to6] = useState(true);
  const [showSeg6to50, setShowSeg6to50] = useState(true);
  const [showSeg50to100, setShowSeg50to100] = useState(true);
  const [showSeg100, setShowSeg100] = useState(true);


  // Chart 8: Quadrant Y-axis mode
  const [yAxisMode, setYAxisMode] = useState<ViewRateMode>("view_2s_rate");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (selectedAdvertisers.length > 0) {
        params.set(
          "advertiser_id",
          selectedAdvertisers.map((o) => o.value).join(","),
        );
      }
      const res = await fetch(`/api/tiktok/dashboard?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "เกิดข้อผิดพลาด");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedAdvertisers]);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const advertiserOptions: SelectOption[] = useMemo(
    () =>
      (data?.advertisers ?? []).map((a) => ({
        value: a.advertiser_id,
        label: a.advertiser_name,
      })),
    [data?.advertisers],
  );

  const totals = data?.totals;

  // F22: Campaign / Ad Group filter (client-side — data is already scoped
  // to the selected advertiser + date range).
  const [campaignFilter, setCampaignFilter] = useState<SelectOption | null>(null);
  const [adgroupFilter, setAdgroupFilter] = useState<SelectOption | null>(null);
  // F18/AC8: click a quadrant summary box to filter the ad table by it —
  // kept in sync with `?quadrant=` so the filtered view is bookmarkable/
  // shareable, initialized from the URL on first load.
  const [quadrantFilter, setQuadrantFilterState] = useState<string | null>(() => searchParams.get("quadrant"));
  const setQuadrantFilter = useCallback(
    (value: string | null) => {
      setQuadrantFilterState(value);
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("quadrant", value);
      else params.delete("quadrant");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const campaignOptions: SelectOption[] = useMemo(() => {
    const names = new Set((data?.by_ad ?? []).map((r) => r.campaign_name).filter(Boolean));
    return [...names].sort().map((n) => ({ value: n, label: n }));
  }, [data?.by_ad]);

  const adgroupOptions: SelectOption[] = useMemo(() => {
    const names = new Set((data?.by_ad ?? []).map((r) => r.adgroup_name).filter(Boolean));
    return [...names].sort().map((n) => ({ value: n, label: n }));
  }, [data?.by_ad]);

  // Campaign/Ad Group filtered rows — feeds the scatter chart, quadrant
  // summary counts, and the ad table below.
  // F17: admin threshold override form
  const [thresholdDraft, setThresholdDraft] = useState<{ spend: string; rate: string }>({ spend: "", rate: "" });
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null); // EC11
  useEffect(() => {
    if (data?.quadrant_thresholds) {
      setThresholdDraft({ // eslint-disable-line react-hooks/set-state-in-effect -- syncing editable local draft from server data once it loads, not the derived-state anti-pattern
        spend: String(data.quadrant_thresholds.spend_threshold),
        rate: String(data.quadrant_thresholds.rate_threshold),
      });
    }
  }, [data?.quadrant_thresholds]);

  const saveThresholds = async (clear: boolean) => {
    setThresholdError(null);
    // EC11: block a 0/negative/non-numeric threshold before it ever hits the
    // API — a Quadrant Matrix with threshold 0 puts every ad on one side.
    if (!clear) {
      const spendNum = Number(thresholdDraft.spend);
      const rateNum = Number(thresholdDraft.rate);
      if (!Number.isFinite(spendNum) || spendNum <= 0 || !Number.isFinite(rateNum) || rateNum <= 0) {
        setThresholdError("Threshold ไม่ถูกต้อง — ต้องมากกว่า 0 กด Clear เพื่อใช้ค่า default อัตโนมัติแทน");
        return;
      }
    }
    setSavingThresholds(true);
    try {
      const res = await fetch("/api/tiktok/quadrant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          clear
            ? { spend_threshold: null, rate_threshold: null }
            : { spend_threshold: Number(thresholdDraft.spend), rate_threshold: Number(thresholdDraft.rate) },
        ),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setThresholdError(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      await fetchData();
    } finally {
      setSavingThresholds(false);
    }
  };

  // F23: CSV/PDF export — both generated server-side (see app/api/tiktok/export/*),
  // same filters as the dashboard itself.
  const exportQuery = useMemo(
    () =>
      new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        ...(selectedAdvertisers.length > 0 ? { advertiser_id: selectedAdvertisers.map((o) => o.value).join(",") } : {}),
      }).toString(),
    [dateFrom, dateTo, selectedAdvertisers],
  );

  // Advertiser selection stays global — only dates are overridable per section
  // — so every section's own fetch has to carry it. A plain string (not the
  // option array) keeps it usable as a stable effect dependency.
  const advertiserIds = useMemo(
    () => selectedAdvertisers.map((o) => o.value).join(","),
    [selectedAdvertisers],
  );
  const sectionProps = {
    globalData: data,
    globalFrom: dateFrom,
    globalTo: dateTo,
    advertiserIds,
  };

  return (
    // LINE Seed Sans TH (see @font-face in globals.css), scoped to this page.
    <div className="min-h-screen bg-gray-100">
      {/* EC3/AC6: token revoked/expired — a blocking modal, not a dismissible
          banner, so it can't be missed. Dashboard content still renders
          underneath (old data stays visible, nothing is deleted). */}
      {!connected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <p className="text-red-700 font-semibold mb-2">⚠ API Disconnected</p>
            <p className="text-sm text-gray-700 mb-5">
              TikTok token ใช้ไม่ได้แล้ว (หมดอายุหรือถูก revoke) กรุณา re-authenticate ก่อนใช้งานต่อ — ข้อมูลเก่ายังอยู่ครบ ไม่มีอะไรถูกลบ
            </p>
            {isAdmin ? (
              <button
                onClick={() => router.push("/tiktok/sync")}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm"
              >
                ไปหน้า Sync เพื่อ Re-authenticate
              </button>
            ) : (
              <p className="text-sm text-gray-500">กรุณาติดต่อ admin เพื่อ re-authenticate</p>
            )}
          </div>
        </div>
      )}

      {/* Header — same AdminNav/UserNav every other page uses (name +
          Logout everywhere). AC10: admin gets AdminNav (its TikTok dropdown
          already covers the old "Sync Data" shortcut); Viewer gets UserNav
          (already covers the old "Facebook Dashboard" link). */}
      {isAdmin ? (
        <AdminNav subtitle="TikTok — Dashboard" />
      ) : (
        <UserNav subtitle="TikTok — Dashboard" user={currentUser} authLoading={authLoading} />
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Filters — flat pill row, no card/labels: placeholder text alone
            ("ทุก Advertiser" etc.) says what each control is. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-45">
            <ReactSelect
              isMulti
              options={advertiserOptions}
              value={selectedAdvertisers}
              onChange={(v) => setSelectedAdvertisers(v as SelectOption[])}
              placeholder="ทุก Advertiser"
              className="text-sm"
              classNamePrefix="rs"
            />
          </div>

          <div className="min-w-40">
            <ReactSelect
              isClearable
              options={campaignOptions}
              value={campaignFilter}
              onChange={(v) => setCampaignFilter(v as SelectOption | null)}
              placeholder="ทุก Campaign"
              className="text-sm"
              classNamePrefix="rs"
            />
          </div>

          <div className="min-w-40">
            <ReactSelect
              isClearable
              options={adgroupOptions}
              value={adgroupFilter}
              onChange={(v) => setAdgroupFilter(v as SelectOption | null)}
              placeholder="ทุก Ad Group"
              className="text-sm"
              classNamePrefix="rs"
            />
          </div>

          <span className="text-gray-300">|</span>

          <div className="flex items-center gap-2">
            <DateInput
              value={dateFrom}
              onChange={setDateFrom}
              className="border border-gray-300 rounded-full px-3 py-1.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="ตั้งแต่วันที่"
            />
            <span className="text-gray-400">—</span>
            <DateInput
              value={dateTo}
              onChange={setDateTo}
              className="border border-gray-300 rounded-full px-3 py-1.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="ถึงวันที่"
            />
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="bg-primary hover:bg-primary/80 disabled:bg-gray-300 text-secondary font-semibold px-5 py-1.5 rounded-full transition-colors text-sm ml-auto"
          >
            {loading ? "กำลังโหลด…" : "Apply"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* EC10/AC5: TikTok API มีปัญหาต่อเนื่อง (ไม่ใช่ auth error) — banner
            เตือนเฉย ๆ ไม่บล็อกหน้าจอ ต่างจาก auth-revoke modal ด้านล่าง
            ซึ่งบังคับ re-authenticate */}
        {connected && (statusInfo.outage_minutes ?? 0) >= 30 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <p className="text-amber-800 text-sm font-medium">
              ⚠ TikTok API มีปัญหา — sync ล้มเหลวต่อเนื่องมา {statusInfo.outage_minutes} นาที ข้อมูลที่แสดงอาจไม่อัปเดต
            </p>
          </div>
        )}

        {/* F26: cached-data label — folded into HeroSpend's asOf below now
            that Total Spend is a full-width card with room for it. */}

        {/* EC4: which report metrics the connected ad account can't read —
            explains a stuck-at-0 KPI instead of leaving it unexplained */}
        {data && data.restricted_metrics.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" title="Business API return permission_denied สำหรับ field เหล่านี้ — อาจเห็นเป็น 0 หรือ blank">
            🔒 บาง metric อาจไม่มีสิทธิ์เข้าถึงในบัญชีนี้: {data.restricted_metrics.join(", ")}
          </p>
        )}

        {/* Scorecards (always visible) */}
        {totals && (
          <>
            {/* Grouped by what the numbers are ABOUT, not by how many fit a
                row — the previous four rows mixed spend, video, engagement
                and account metrics with no ordering logic, and carried two
                exact duplicates: "Unique Video Views" and "Reach" were both
                totals.reach, and "Impression" / "Impressions" were both
                totals.impressions. One tile now stands for each figure. */}

            <HeroSpend
              spend={totals.spend}
              prevSpend={data?.prev_totals.spend ?? null}
              monthLabel={rangeMonthLabel(dateFrom, dateTo)}
              asOf={data?.last_success_at ? new Date(data.last_success_at).toLocaleString("th-TH") : null}
            />
            {/* Same SECTION_CARD every other section on the page uses — see
                its definition for why. */}
            <div className={`${SECTION_CARD} space-y-4`}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile
                label="Impressions"
                value={fmt(totals.impressions)}
                thisMonth={data && deltaOf(totals.impressions, data.prev_totals.impressions, fmt)}
                lastMonth={data && fmt(data.prev_totals.impressions)}
              />
              {/* scope only appears when the number is NOT what it should
                  be: TikTok's own deduplicated reach for this range. Silence
                  otherwise, matching how scope is used on the account-split
                  tiles above — a tag appears when something about the
                  figure needs qualifying, not on every tile as a status
                  light. */}
              <KpiTile
                label="Reach"
                scope={data?.reach_source === "summed_fallback" ? "⚠️ ประมาณการ" : undefined}
                value={fmt(totals.reach)}
                thisMonth={data && deltaOf(totals.reach, data.prev_totals.reach, fmt)}
                lastMonth={data && fmt(data.prev_totals.reach)}
              />
              <KpiTile
                label="CPM"
                value={fmtCurrency(totals.cpm)}
                thisMonth={data && deltaOf(totals.cpm, data.prev_totals.cpm, fmtCurrency)}
                lastMonth={data && fmtCurrency(data.prev_totals.cpm)}
              />
              <KpiTile
                label="CPC"
                value={fmtCurrency(totals.cpc)}
                thisMonth={data && deltaOf(totals.cpc, data.prev_totals.cpc, fmtCurrency)}
                lastMonth={data && fmtCurrency(data.prev_totals.cpc)}
              />
            </div>

            <SectionBand>Account — Ads vs Organic</SectionBand>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Headline is the account's total video views (paid +
                  organic) when that data has synced, with paid and organic
                  broken out beneath — same pattern as the tiles beside it.
                  Date-matched, unlike the Content Engagement card in this
                  same tab: this figure is a genuine daily account total
                  (verified against TikTok Studio's export), so summing it
                  over the selected range is comparing like with like against
                  the paid side, not mixing a lifetime total into a
                  date-ranged tile — which is why it lives here, grouped with
                  the other account-level splits, and not in Video
                  Performance, which is otherwise entirely paid-only.

                  Falls back to the old paid-only reading when no
                  account-level video_views has synced yet. */}
              <KpiTile
                label="Video view"
                scope={data?.profile_metrics.video_views != null ? "ทั้งบัญชี" : "Ads"}
                value={fmt(data?.profile_metrics.video_views ?? totals.video_views)}
                breakdown={
                  data?.profile_metrics.video_views != null
                    ? [
                        { label: "Ads", value: fmt(totals.video_views) },
                        {
                          label: "Organic",
                          value: (() => {
                            const organic = data.profile_metrics.video_views! - totals.video_views;
                            return organic < 0 ? `−${fmt(Math.abs(organic))}` : fmt(organic);
                          })(),
                        },
                      ]
                    : undefined
                }
                thisMonth={
                  data?.profile_metrics.video_views != null && data.profile_metrics.prev_video_views != null
                    ? deltaOf(data.profile_metrics.video_views, data.profile_metrics.prev_video_views, fmt)
                    : data && deltaOf(totals.video_views, data.prev_totals.video_views, fmt)
                }
                lastMonth={
                  data?.profile_metrics.prev_video_views != null
                    ? fmt(data.profile_metrics.prev_video_views)
                    : data && fmt(data.prev_totals.video_views)
                }
              />
              {/* Profile views exist only at account level — this tile used to
                  be wired to `followers`, so once that data arrived it would
                  have shown a follower count under a "Profile view" label. */}
              <KpiTile
                label="Profile view"
                scope="ทั้งบัญชี"
                value={data?.profile_metrics.profile_views != null ? fmt(data.profile_metrics.profile_views) : "—"}
                thisMonth={
                  data?.profile_metrics.profile_views != null && data.profile_metrics.prev_profile_views != null
                    ? deltaOf(data.profile_metrics.profile_views, data.profile_metrics.prev_profile_views, fmt)
                    : null
                }
                lastMonth={data?.profile_metrics.prev_profile_views != null ? fmt(data.profile_metrics.prev_profile_views) : null}
              />
              {/* followers_count is a running total, so the change shown is the
                  net gain over the period (new_followers summed) rather than
                  the difference between two totals — the same number, but the
                  one that stays right when the selected range moves. */}
              <KpiTile
                label="followers"
                scope="ทั้งบัญชี"
                value={data?.profile_metrics.followers != null ? fmt(data.profile_metrics.followers) : "—"}
                thisMonth={
                  data?.profile_metrics.new_followers != null
                    ? { text: fmt(Math.abs(data.profile_metrics.new_followers)), up: data.profile_metrics.new_followers >= 0 }
                    : null
                }
                lastMonth={data?.profile_metrics.prev_followers != null ? fmt(data.profile_metrics.prev_followers) : null}
              />
              {/* Headline is the account's own follower gain over the period,
                  not the ads report's paid follows — the tile used to show the
                  latter while the tile beside it showed the account total, and
                  the two read as one series. Paid and organic sit underneath
                  because the split is the point: in August those were 506 and
                  0, i.e. every follower that month was bought.

                  Falls back to paid-only when there is no account-level data
                  yet, which is what it always showed before. */}
              <KpiTile
                label="New followers"
                scope={data?.profile_metrics.new_followers != null ? "ทั้งบัญชี" : "Ads"}
                value={fmt(data?.profile_metrics.new_followers ?? totals.follows)}
                breakdown={
                  data?.profile_metrics.new_followers != null
                    ? [
                        { label: "Ads", value: fmt(totals.follows) },
                        {
                          // NOT clamped at 0. paid follows counts everyone who
                          // followed after seeing an ad; the account figure is
                          // net of unfollows. When ads bought more followers
                          // than the account kept, the remainder is negative,
                          // and that is the finding — hiding it behind a zero
                          // reports churn as if it were break-even.
                          label: "Organic",
                          value: (() => {
                            const organic = data.profile_metrics.new_followers! - totals.follows;
                            return organic < 0 ? `−${fmt(Math.abs(organic))}` : fmt(organic);
                          })(),
                        },
                      ]
                    : undefined
                }
                thisMonth={
                  data?.profile_metrics.new_followers != null && data.profile_metrics.prev_new_followers != null
                    ? deltaOf(data.profile_metrics.new_followers, data.profile_metrics.prev_new_followers, fmt)
                    : data && deltaOf(totals.follows, data.prev_totals.follows, fmt)
                }
                lastMonth={
                  data?.profile_metrics.prev_new_followers != null
                    ? fmt(data.profile_metrics.prev_new_followers)
                    : data && fmt(data.prev_totals.follows)
                }
              />
            </div>

            <SectionBand>Engagement &amp; Video Performance</SectionBand>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile
                label="Like"
                value={fmt(totals.likes)}
                thisMonth={data && deltaOf(totals.likes, data.prev_totals.likes, fmt)}
                lastMonth={data && fmt(data.prev_totals.likes)}
              />
              <KpiTile
                label="Comment"
                value={fmt(totals.comments)}
                thisMonth={data && deltaOf(totals.comments, data.prev_totals.comments, fmt)}
                lastMonth={data && fmt(data.prev_totals.comments)}
              />
              <KpiTile
                label="Shares"
                value={fmt(totals.shares)}
                thisMonth={data && deltaOf(totals.shares, data.prev_totals.shares, fmt)}
                lastMonth={data && fmt(data.prev_totals.shares)}
              />
              <KpiTile
                label="Engagement"
                value={fmt(totals.likes + totals.comments + totals.shares)}
                thisMonth={
                  data &&
                  deltaOf(
                    totals.likes + totals.comments + totals.shares,
                    data.prev_totals.likes + data.prev_totals.comments + data.prev_totals.shares,
                    fmt,
                  )
                }
                lastMonth={data && fmt(data.prev_totals.likes + data.prev_totals.comments + data.prev_totals.shares)}
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiTile
                label="Avg. Watch Time"
                value={`${totals.avg_watch_time.toFixed(1)}s`}
                thisMonth={data && deltaOf(totals.avg_watch_time, data.prev_totals.avg_watch_time, (n) => `${n.toFixed(1)}s`)}
                lastMonth={data && `${data.prev_totals.avg_watch_time.toFixed(1)}s`}
              />
              <KpiTile
                label="Avg. View Rate (50%)"
                value={`${totals.view_50_rate.toFixed(1)}%`}
                thisMonth={data && deltaOf(totals.view_50_rate, data.prev_totals.view_50_rate, (n) => `${n.toFixed(1)}%`)}
                lastMonth={data && `${data.prev_totals.view_50_rate.toFixed(1)}%`}
              />
              <KpiTile
                label="100% Views"
                value={fmt(totals.video_view_p100)}
                thisMonth={data && deltaOf(totals.video_view_p100, data.prev_totals.video_view_p100, fmt)}
                lastMonth={data && fmt(data.prev_totals.video_view_p100)}
              />
              {/* Distinct ad_ids with data in the selected range — the same
                  count Ads delivering charts on the Timeline, just for the
                  whole period instead of per day. Named to avoid reading as
                  a video/post count, which it is not (see that chart's own
                  label fix). */}
              <KpiTile
                label="Ads with Data"
                value={fmt(data?.by_ad.length ?? 0)}
                thisMonth={data && deltaOf(data.by_ad.length, data.prev_video_count, fmt)}
                lastMonth={data && fmt(data.prev_video_count)}
              />
              {/* Distinct organic posts (tiktok_post_totals) whose publish
                  date falls in the selected range — a real count of videos
                  actually uploaded that period, unlike Ads with Data beside
                  it (which counts ads, not content). scope="Organic"
                  because posting isn't an ad action — there's no "paid"
                  version of this number to split against. */}
              <KpiTile
                label="Videos Posted"
                scope="Organic"
                value={data?.video_engagement_summary != null ? fmt(data.video_engagement_summary.post_count) : "—"}
                thisMonth={
                  data?.video_engagement_summary != null
                    ? deltaOf(data.video_engagement_summary.post_count, data.video_engagement_summary.prev_post_count, fmt)
                    : null
                }
                lastMonth={data?.video_engagement_summary != null ? fmt(data.video_engagement_summary.prev_post_count) : null}
              />
            </div>
            </div>
            {/* AC10: Export disabled for Viewer (role "user") — API-side is
                already admin-only (middleware), this is just the matching
                UI state + tooltip so it's not a dead click. */}
            <div className="flex justify-end gap-2">
              {isAdmin ? (
                <>
                  <a
                    href={`/api/tiktok/export/csv?${exportQuery}`}
                    className="text-sm bg-white border border-gray-300 hover:bg-gray-50 text-black font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Export CSV
                  </a>
                  <a
                    href={`/api/tiktok/export/pdf?${exportQuery}`}
                    className="text-sm bg-white border border-gray-300 hover:bg-gray-50 text-black font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Export PDF
                  </a>
                </>
              ) : (
                <>
                  <button disabled title="ไม่มีสิทธิ์" className="text-sm bg-gray-100 border border-gray-200 text-gray-400 font-medium px-4 py-2 rounded-lg cursor-not-allowed">
                    Export CSV
                  </button>
                  <button disabled title="ไม่มีสิทธิ์" className="text-sm bg-gray-100 border border-gray-200 text-gray-400 font-medium px-4 py-2 rounded-lg cursor-not-allowed">
                    Export PDF
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* Tabs — iOS segmented control: gray track, active = white pill */}
        <div>
          <div className="flex gap-1 bg-gray-200/70 border border-gray-300 rounded-md p-1">
            {(
              [
                { key: "overview", label: "KPI Overview" },
                { key: "audience", label: "Audience" },
                { key: "videos", label: "Videos" },
                { key: "quadrant", label: "Quadrant" },
              ] as { key: TabKey; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex-1 px-3 py-1.5 rounded text-sm font-semibold transition-all duration-200 ${
                  activeTab === t.key
                    ? "bg-white text-black shadow-[0_1px_4px_rgba(0,0,0,0.15)]"
                    : "text-gray-500 hover:text-black"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="pt-5">
            {/* ── Tab 1: KPI Overview — Timeline Chart ───────────────────── */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* Cost Distribution Donut — moved here from the Audience tab:
                    this is a spend/objective breakdown, not an audience
                    dimension, so it belongs with the other KPI-level views.
                    Leads the tab, ahead of the Timeline chart, per request. */}
                <DashboardSection
                  {...sectionProps}
                  title="การกระจาย Spend ตามวัตถุประสงค์ (Objective)"
                  subtitle="Reach / Video View / Community Interaction · แสดงทั้งจำนวนเงินและ %"
                >
                  {(d) => {
                    const cost = costChartData(d);
                    const totalCost = cost.reduce((sum, c) => sum + c.value, 0);
                    return (
                      <>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
                          <div style={{ width: "100%", height: 280 }}>
                            <ResponsiveContainer>
                              <PieChart>
                                <Pie
                                  data={cost}
                                  innerRadius={70}
                                  outerRadius={110}
                                  paddingAngle={2}
                                  dataKey="value"
                                >
                                  {cost.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(v) => typeof v === "number" ? fmtCurrency(v) : String(v)} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-2">
                            {cost.map((c) => {
                              const pct = totalCost > 0 ? (c.value / totalCost) * 100 : 0;
                              return (
                                <div
                                  key={c.name}
                                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: c.color }}
                                    />
                                    <span className="text-sm font-medium text-black">{c.name}</span>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-black">
                                      {fmtCurrency(c.value)}
                                    </p>
                                    <p className="text-xs text-black">{pct.toFixed(1)}%</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* "Other" ไม่ใช่ bug เสมอไป — campaign objective บางแบบ
                            (TRAFFIC, LEAD_GENERATION, ...) ไม่เข้าพวก 3 หมวดหลักจริง ๆ
                            โชว์ objective ดิบที่อยู่ใน Other ให้เห็นตรง ๆ ว่าทำไม */}
                        {(d.cost_distribution.Other ?? 0) > 0 && d.cost_distribution_other_objectives.length > 0 && (
                          <p className="text-xs text-gray-400 mt-2">
                            Other มาจาก objective: {d.cost_distribution_other_objectives.join(", ")}
                          </p>
                        )}
                      </>
                    );
                  }}
                </DashboardSection>

                {/* The bar counts distinct ad_id present in that day's rows
                    (daily_timeline in the dashboard route), and TikTok returns
                    no row at all for an ad that got no delivery — so it means
                    "ads that delivered", never "ads that were switched on".
                    It was labelled "Videos", which is neither: one video can
                    run as several ads. */}
                <DashboardSection
                  {...sectionProps}
                  title="Timeline — Ads delivering / Likes / New Followers"
                  subtitle="แท่ง = จำนวน ad ที่มี delivery วันนั้น (ad ที่เปิดอยู่แต่ยอด 0 ไม่ถูกนับ) · เส้น = Likes & New Followers"
                  headerExtra={
                    <div className="flex flex-wrap gap-3 text-xs">
                      <label className="flex items-center gap-1.5 text-black">
                        <input
                          type="checkbox"
                          checked={showVideos}
                          onChange={(e) => setShowVideos(e.target.checked)}
                        />
                        Ads delivering
                      </label>
                      <label className="flex items-center gap-1.5 text-black">
                        <input
                          type="checkbox"
                          checked={showLikes}
                          onChange={(e) => setShowLikes(e.target.checked)}
                        />
                        Likes
                      </label>
                      <label className="flex items-center gap-1.5 text-black">
                        <input
                          type="checkbox"
                          checked={showFollows}
                          onChange={(e) => setShowFollows(e.target.checked)}
                        />
                        New Followers
                      </label>
                    </div>
                  }
                >
                  {(d) => (
                <div style={{ width: "100%", height: 380 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={d.daily_timeline ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#000" }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#000" }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#000" }} />
                      <Tooltip />
                      <Legend />
                      {showVideos && (
                        <Bar yAxisId="left" dataKey="videos" name="Ads delivering" fill="#1a2b4a" />
                      )}
                      {showLikes && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="likes"
                          name="Likes"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={false}
                        />
                      )}
                      {showFollows && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="follows"
                          name="New Followers"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                  )}
                </DashboardSection>

                {/* Account Metrics — TikTok Business Account, whole account
                    (paid + organic), not per ad account. Always rendered: this
                    section used to be gated on snapshot_date, which only ever
                    came from the older F15 snapshot, so it stayed invisible
                    with no explanation of what was missing or why. */}
                <DashboardSection
                  {...sectionProps}
                  title="Account Metrics"
                  subtitle={(d) =>
                    `TikTok Business Account — ทั้งบัญชี (paid + Organic) แยกตาม advertiser ไม่ได้${
                      d.profile_metrics.snapshot_date ? ` · ข้อมูล ณ ${d.profile_metrics.snapshot_date}` : ""
                    }`
                  }
                >
                  {(d) => (
                    <>
                      {d.profile_metrics.profile_views == null && d.profile_metrics.followers == null && (
                        // Rendered even with nothing to show, and saying why:
                        // hiding the section left the team with no explanation
                        // for why account-level numbers were simply absent.
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                          ยังไม่มีข้อมูล — Profile Views และยอดผู้ติดตามทั้งบัญชีมาจากตาราง
                          <code className="mx-1">tiktok_account_totals_daily</code>
                          ซึ่งยังว่างอยู่ กด &quot;Sync Organic Data&quot; ที่หน้า /tiktok/sync เพื่อดึงเข้ามา
                        </p>
                      )}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Scorecard
                          label="Profile Views"
                          value={d.profile_metrics.profile_views != null ? fmt(d.profile_metrics.profile_views) : "—"}
                          sub={
                            d.profile_metrics.prev_profile_views != null
                              ? `ช่วงก่อนหน้า ${fmt(d.profile_metrics.prev_profile_views)}`
                              : undefined
                          }
                          change={pctChangeOf(d.profile_metrics.profile_views, d.profile_metrics.prev_profile_views)}
                        />
                        <Scorecard
                          label="Followers"
                          value={d.profile_metrics.followers != null ? fmt(d.profile_metrics.followers) : "—"}
                          sub={
                            d.profile_metrics.prev_followers != null
                              ? `ช่วงก่อนหน้า ${fmt(d.profile_metrics.prev_followers)}`
                              : undefined
                          }
                          change={pctChangeOf(d.profile_metrics.followers, d.profile_metrics.prev_followers)}
                        />
                        <Scorecard
                          label="New Followers"
                          value={d.profile_metrics.new_followers != null ? fmt(d.profile_metrics.new_followers) : "—"}
                          sub={
                            d.profile_metrics.prev_new_followers != null
                              ? `ช่วงก่อนหน้า ${fmt(d.profile_metrics.prev_new_followers)}`
                              : undefined
                          }
                          change={pctChangeOf(d.profile_metrics.new_followers, d.profile_metrics.prev_new_followers)}
                        />
                        <Scorecard
                          label="Engagement Rate"
                          value={d.profile_metrics.engagement_rate != null ? `${d.profile_metrics.engagement_rate.toFixed(1)}%` : "—"}
                        />
                      </div>

                      {/* Paid vs organic follower growth. Verified against
                          August's exports: TikTok's own "Paid follows" for the
                          month was 506 and the account gained 506 followers,
                          so every follower that month was bought — a split
                          worth showing rather than leaving as one number that
                          reads like organic reach.

                          Deliberately not attempted for Profile Views: the
                          same exports put paid profile visits (983) ABOVE the
                          account's total profile views (699), so subtracting
                          there produces a negative organic figure out of two
                          numbers TikTok measures differently. */}
                      {d.profile_metrics.new_followers != null && (
                        <p className="text-xs text-black mt-3">
                          New Followers <strong>{fmt(d.profile_metrics.new_followers)}</strong> ={" "}
                          Paid <strong>{fmt(d.totals.follows)}</strong> ·{" "}
                          Organic{" "}
                          <strong>
                            {d.profile_metrics.new_followers - d.totals.follows < 0
                              ? `−${fmt(Math.abs(d.profile_metrics.new_followers - d.totals.follows))}`
                              : fmt(d.profile_metrics.new_followers - d.totals.follows)}
                          </strong>
                          <span className="text-gray-500">
                            {" "}— Paid นับเฉพาะ advertiser ที่เลือกอยู่ ส่วนยอดรวมเป็นของทั้งบัญชี
                            {d.profile_metrics.new_followers - d.totals.follows < 0 &&
                              " · Organic ติดลบ = แอดซื้อผู้ติดตามมามากกว่าที่บัญชีโตจริง ส่วนต่างคือคนที่เลิกติดตาม"}
                          </span>
                        </p>
                      )}

                      {/* Said on the page because it is the obvious next
                          question once followers are split, and the answer is
                          a property of TikTok's data rather than something
                          this dashboard chose not to do. */}
                      {d.profile_metrics.profile_views != null && (
                        <p className="text-xs text-gray-500 mt-1">
                          Profile Views และยอดผู้ติดตามรวม แยก paid/organic ไม่ได้ — TikTok นับ
                          &quot;paid profile visits&quot; คนละฐานกับ Profile Views (ส.ค. paid 983 แต่ยอดรวมทั้งหมด 699)
                          และยอดผู้ติดตามเป็นยอดสะสม ไม่ใช่ยอดที่เพิ่มในช่วงนี้
                        </p>
                      )}
                    </>
                  )}
                </DashboardSection>

                {/* Scoped to posts PUBLISHED within the selected date range
                    (create_time), not to when the engagement happened —
                    organic engagement has no daily breakdown to filter by
                    (unlike the paid side), but a post's publish date is
                    real, so "videos posted this month" is answerable even
                    though "views earned this month" is not. Each counted
                    post still contributes its full lifetime total. Best
                    Videos below stays a lifetime leaderboard across every
                    post regardless of publish date — a different question,
                    not changed here. */}
                <DashboardSection
                  {...sectionProps}
                  title="Content Engagement — Ads vs Organic"
                  subtitle={(d) =>
                    d.video_engagement_summary
                      ? `คลิปที่ลงในช่วงวันที่เลือก (${d.video_engagement_summary.post_count} คลิป) — ตัวเลขเป็นยอดสะสมตลอดชีพของคลิปนั้นๆ ไม่ใช่ยอดเฉพาะช่วงนี้`
                      : "ยังไม่มีข้อมูล Organic ระดับคลิป — กด \"Sync Organic Data\" ที่หน้า /tiktok/sync"
                  }
                >
                  {(d) =>
                    !d.video_engagement_summary ? (
                      <p className="text-xs text-gray-400">ไม่มีข้อมูล</p>
                    ) : (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {(
                          [
                            ["views", "Views"],
                            ["likes", "Likes"],
                            ["shares", "Shares"],
                            ["comments", "Comments"],
                          ] as const
                        ).map(([key, label]) => {
                          const m = d.video_engagement_summary![key];
                          const organicNeg = m.organic != null && m.organic < 0;
                          return (
                            <Scorecard
                              key={key}
                              label={label}
                              value={fmt(m.total)}
                              sub={`ads ${fmt(m.paid ?? 0)} · Organic ${organicNeg ? "−" : ""}${fmt(Math.abs(m.organic ?? 0))}`}
                            />
                          );
                        })}
                      </div>
                    )
                  }
                </DashboardSection>

              </div>
            )}

            {/* ── Tab 2: Audience ─────────────────────────────────────────── */}
            {activeTab === "audience" && data && (
              <div className="space-y-8">
                {/* Weekly Engagement Bar */}
                <DashboardSection
                  {...sectionProps}
                  title="Engagement รายวัน (จ–อา)"
                  subtitle="รวม Likes + Comments + Shares ของทุกวันที่ตรงกับวันนั้นในช่วงที่เลือก"
                >
                  {(d) => {
                    const weekly = weeklyChartData(d);
                    return (
                      <div style={{ width: "100%", height: 280 }}>
                        <ResponsiveContainer>
                          <BarChart data={weekly} margin={{ top: 20 }}>
                            <CartesianGrid vertical={false} stroke="#e5e7eb" />
                            <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#000" }} />
                            <YAxis tick={{ fontSize: 11, fill: "#000" }} />
                            <Tooltip />
                            <Bar dataKey="value" name="Engagement" radius={[2, 2, 0, 0]} fill="#2a4a73">
                              {weekly.map((w, i) => (
                                <Cell key={i} fill={w.value === Math.max(...weekly.map((x) => x.value)) ? "#0f2540" : "#2a4a73"} />
                              ))}
                              <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontWeight: 700, fill: "#1a2b4a" }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  }}
                </DashboardSection>

                {/* Timing Heatmap (F14) */}
                <DashboardSection
                  {...sectionProps}
                  title="Timing Heatmap"
                  subtitle={(d) =>
                    `Engagement Rate ตามวันในสัปดาห์ × ชั่วโมง (UTC) — sync แยกทุก 12 ชม. ย้อนหลัง 30 วัน${
                      d.timing_heatmap.every((c) => c.engagement_rate === 0)
                        ? " · ยังไม่มีข้อมูล ลอง sync-heatmap ก่อน"
                        : ""
                    }`
                  }
                >
                  {(d) => <TimingHeatmapChart d={d} />}
                </DashboardSection>

                {/* Thailand Map + Province Table */}
                <DashboardSection
                  {...sectionProps}
                  title="Audience ตามจังหวัด (ประเทศไทย)"
                  subtitle="สีเข้ม = สัดส่วน reach สูง · ตารางขวาคือ % ของ audience รวมในแต่ละจังหวัด"
                >
                  {(d) => (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <ThaiMapCard
                        regions={d.audience_provinces.map((p) => ({
                          region: provinceName(p.province_id, p.province_name),
                          value: p.percentage,
                        }))}
                      />

                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <SortableTable
                          data={d.audience_provinces.slice(0, 15)}
                          defaultSort={[{ id: "percentage", desc: true }]}
                          columns={provinceColumns}
                          pageSize={15}
                          emptyMessage="ไม่มีข้อมูล"
                        />
                      </div>
                    </div>
                  )}
                </DashboardSection>

                {/* Gender + Age side-by-side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Gender Donut */}
                  <DashboardSection {...sectionProps} title="เพศของ audience" subtitle="% reach แยกตามเพศ">
                    {(d) => {
                      const gender = genderChartData(d);
                      return (
                        <div style={{ width: "100%", height: 260 }} className="relative">
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie
                                data={gender}
                                innerRadius={60}
                                outerRadius={90}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {gender.map((entry, idx) => (
                                  <Cell key={idx} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v) => typeof v === "number" ? `${v.toFixed(1)}%` : v} />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
                            <p className="text-xs text-black">รวม</p>
                            <p className="text-2xl font-bold text-black">
                              {(gender[0]?.value ?? 0) + (gender[1]?.value ?? 0) > 0 ? "100%" : "—"}
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  </DashboardSection>

                  {/* Age Horizontal Bar */}
                  <DashboardSection {...sectionProps} title="ช่วงอายุของ audience" subtitle="% reach แยกตามช่วงอายุ">
                    {(d) => (
                      <div style={{ width: "100%", height: 260 }}>
                        <ResponsiveContainer>
                          <BarChart data={d.audience_age} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: "#000" }} />
                            <YAxis
                              type="category"
                              dataKey="group"
                              tick={{ fontSize: 12, fill: "#000" }}
                              width={60}
                            />
                            <Tooltip formatter={(v) => typeof v === "number" ? `${v.toFixed(1)}%` : v} />
                            <Bar
                              dataKey="percentage"
                              name="% Audience"
                              fill="#1a2b4a"
                              radius={[0, 8, 8, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </DashboardSection>
                </div>

                {/* Age breakdown w/ performance */}
                <DashboardSection
                  {...sectionProps}
                  title="Detailed Analysis by Age"
                  subtitle="Cost / CTR / CPC / Video Views แยกตามช่วงอายุ — คอลัมน์ 2s / 6s / 50% / 100% คือจำนวนคนที่ดูถึงจุดนั้น และ % ของ Video Views ในช่วงอายุเดียวกัน"
                >
                  {(d) => <SortableTable data={d.audience_age_performance} columns={agePerformanceColumns} />}
                </DashboardSection>

                {/* Interest Alignment — see SHOW_INTEREST_ALIGNMENT above.
                    The empty-check moved inside the section: gating on the
                    global data would hide the section even when this
                    section's own date range does have interests. */}
                {SHOW_INTEREST_ALIGNMENT && (
                  <DashboardSection
                    {...sectionProps}
                    title="Interest Alignment"
                    subtitle={(d) => `กลุ่มที่เห็นโฆษณาเอียงไปทางหมวดไหน — แท่งคือส่วนต่างจากค่าเฉลี่ย ${d.interest_average.toFixed(1)}% (คนหนึ่งอยู่ได้หลายหมวด % จึงสูงใกล้กันหมด ตัวที่บอกอะไรได้คือส่วนต่าง)`}
                  >
                    {(d) =>
                      d.audience_interests.length === 0 ? (
                        <p className="text-xs text-gray-400">ไม่มีข้อมูลในช่วงวันที่นี้</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(() => {
                            // Bars grow out from a centre line, so above and
                            // below average read at a glance. Scaled to the
                            // largest deviation present rather than a fixed
                            // range — the spread differs per account and per
                            // period, and a fixed one would flatten it again.
                            const widest = Math.max(...d.audience_interests.map((i) => Math.abs(i.vs_average)), 0.1);
                            return d.audience_interests.map((i) => {
                              const half = Math.min(50, (Math.abs(i.vs_average) / widest) * 50);
                              const above = i.vs_average >= 0;
                              return (
                                <div key={i.category} className="flex items-center gap-3">
                                  <span className="text-xs text-black w-40 truncate" title={i.category}>{i.category}</span>
                                  <div className="flex-1 relative h-3">
                                    <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
                                    <div
                                      className={`absolute inset-y-0 ${above ? "bg-emerald-500" : "bg-amber-500"}`}
                                      style={above
                                        ? { left: "50%", width: `${half}%`, borderRadius: "0 9999px 9999px 0" }
                                        : { right: "50%", width: `${half}%`, borderRadius: "9999px 0 0 9999px" }}
                                    />
                                  </div>
                                  <span className={`text-xs w-14 text-right font-semibold ${above ? "text-emerald-700" : "text-amber-700"}`}>
                                    {above ? "+" : ""}{i.vs_average.toFixed(1)}
                                  </span>
                                  <span className="text-xs text-gray-500 w-12 text-right">{i.percentage.toFixed(1)}%</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )
                    }
                  </DashboardSection>
                )}

                {/* Top Occupation — F12, see SHOW_OCCUPATION above */}
                {SHOW_OCCUPATION && (
                  <DashboardSection
                    {...sectionProps}
                    title="Top Occupation"
                    subtitle="% reach ตามอาชีพ (⚠ endpoint นี้ยังไม่ verify กับ TikTok จริง — ถ้าไม่มีข้อมูลแปลว่า API อาจไม่รองรับ dimension นี้)"
                  >
                    {(d) =>
                      d.audience_occupations.length === 0 ? (
                        <p className="text-xs text-gray-400">ไม่มีข้อมูลในช่วงวันที่นี้</p>
                      ) : (
                        <div className="space-y-1.5">
                          {d.audience_occupations.map((o) => (
                            <div key={o.occupation} className="flex items-center gap-3">
                              <span className="text-xs text-black w-40 truncate">{o.occupation}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                                <div className="bg-purple-500 h-3 rounded-full" style={{ width: `${o.percentage}%` }} />
                              </div>
                              <span className="text-xs text-black w-12 text-right">{o.percentage.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </DashboardSection>
                )}

              </div>
            )}

            {/* ── Tab 3: Videos — Stacked Video View ──────────────────────── */}
            {activeTab === "videos" && (
              <div className="space-y-4">
                <DashboardSection
                  {...sectionProps}
                  title="Video View Breakdown รายวัน"
                  subtitle="Stacked bar: สัดส่วนคนที่ดูถึงแต่ละช่วง (ไม่ถึง 2s / 2s–6s / 6s–50% / 50%–100% / 100%) รวมกันเท่ากับ Total Views พอดี"
                  headerExtra={
                    <div className="flex flex-wrap gap-3 text-xs">
                      {[
                        { v: showSegLt2s, set: setShowSegLt2s, label: "ไม่ถึง 2s", color: VIDEO_FUNNEL_COLORS.lt2s },
                        { v: showSeg2to6, set: setShowSeg2to6, label: "2s–6s", color: VIDEO_FUNNEL_COLORS.s2to6 },
                        { v: showSeg6to50, set: setShowSeg6to50, label: "6s–50%", color: VIDEO_FUNNEL_COLORS.s6to50 },
                        { v: showSeg50to100, set: setShowSeg50to100, label: "50%–100%", color: VIDEO_FUNNEL_COLORS.s50to100 },
                        { v: showSeg100, set: setShowSeg100, label: "100%", color: VIDEO_FUNNEL_COLORS.s100 },
                      ].map((c) => (
                        <label key={c.label} className="flex items-center gap-1.5 text-black">
                          <input
                            type="checkbox"
                            checked={c.v}
                            onChange={(e) => c.set(e.target.checked)}
                          />
                          <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: c.color }} />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  }
                >
                  {(d) => (
                    <div style={{ width: "100%", height: 420 }}>
                      <ResponsiveContainer>
                        <BarChart data={videoFunnelChartData(d)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#000" }} />
                          <YAxis tick={{ fontSize: 11, fill: "#000" }} />
                          <Tooltip itemSorter={(item) => VIDEO_FUNNEL_ORDER.indexOf(String(item.dataKey))} />
                          <Legend itemSorter={(item) => VIDEO_FUNNEL_ORDER.indexOf(String(item.dataKey))} />
                          {/* Stack order IS the funnel order (2s→6s→50%→100%,
                              bottom to top) — each bar is the exclusive band
                              between two watch-depth stages, not the raw
                              cumulative count, so the stack sums to exactly
                              Total Views instead of overshooting it. */}
                          {showSegLt2s && (
                            <Bar dataKey="lt2s" name="ไม่ถึง 2s" stackId="a" fill={VIDEO_FUNNEL_COLORS.lt2s} />
                          )}
                          {showSeg2to6 && (
                            <Bar dataKey="s2to6" name="2s–6s" stackId="a" fill={VIDEO_FUNNEL_COLORS.s2to6} />
                          )}
                          {showSeg6to50 && (
                            <Bar dataKey="s6to50" name="6s–50%" stackId="a" fill={VIDEO_FUNNEL_COLORS.s6to50} />
                          )}
                          {showSeg50to100 && (
                            <Bar dataKey="s50to100" name="50%–100%" stackId="a" fill={VIDEO_FUNNEL_COLORS.s50to100} />
                          )}
                          {showSeg100 && (
                            <Bar dataKey="s100" name="100%" stackId="a" fill={VIDEO_FUNNEL_COLORS.s100} radius={[3, 3, 0, 0]} />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </DashboardSection>

                {/* Best Videos leaderboard */}
                <DashboardSection
                  {...sectionProps}
                  title="🔥 Best Videos"
                  subtitle={(d) => `Top ${d.best_videos.length} คลิป เรียงตาม Views รวม`}
                >
                  {(d) =>
                    d.best_videos.length === 0 ? (
                      <p className="text-xs text-gray-400">ไม่มีข้อมูล</p>
                    ) : (
                      <>
                        <SortableTable data={d.best_videos} defaultSort={[{ id: "views", desc: true }]} columns={bestVideosColumns} />
                        {/* Stated on the page because the numbers here answer a
                            different question from every other table on this
                            dashboard, and look wrong if you assume otherwise. */}
                        <p className="text-xs text-gray-500 mt-1">
                          1 แถว = 1 คลิป (คลิปเดียวที่ยิงหลาย ad รวมเป็นแถวเดียว) · ตัวเลขเป็น
                          <strong> ยอดสะสมตลอดชีพของคลิป ไม่ขึ้นกับช่วงวันที่ที่เลือก</strong> ·
                          แต่ละช่อง: ตัวหนา = ยอดรวม · (ads) = Ads · (Organic) = ส่วนที่เหลือ · &quot;—&quot; ที่ (ads) = คลิปนี้ไม่เคยยิงแอด
                        </p>
                      </>
                    )
                  }
                </DashboardSection>
              </div>
            )}

            {/* ── Tab 4: Quadrant Scatter ─────────────────────────────────── */}
            {activeTab === "quadrant" && data && (
              <DashboardSection
                {...sectionProps}
                title={`Quadrant — Spend × ${yAxisModeLabel(yAxisMode)}`}
                subtitle="เส้นเกณฑ์: dashed line = ค่ากลาง · 4 โซน Star / Opportunity / Waste / Low Priority · คลิก dot เพื่อ preview"
                headerExtra={
                  <select
                    value={yAxisMode}
                    onChange={(e) => setYAxisMode(e.target.value as ViewRateMode)}
                    aria-label="Y-axis mode"
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="view_2s_rate">2s View Rate (%)</option>
                    <option value="view_6s_rate">6s View Rate (%)</option>
                    <option value="view_50_rate">50% View Rate (%)</option>
                    <option value="view_100_rate">100% View Rate (%)</option>
                  </select>
                }
              >
                {(qd) => {
                  const qv = buildQuadrantView(qd, campaignFilter, adgroupFilter, yAxisMode);
                  return (
              <div className="space-y-4">

                {/* F17: admin-configurable Star/Opportunity/Waste thresholds
                    (always Spend × 50% View Rate — the actual classification,
                    regardless of which Y-axis is shown above).
                    AC10: this is the "Settings" a Viewer shouldn't get —
                    hidden entirely (not just disabled) for role !== "admin",
                    replaced by a read-only line so they still know what
                    thresholds are in effect. */}
                {isAdmin ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-wrap items-end justify-center gap-3">
                    <p className="text-xs text-gray-500 w-full">
                      เส้นแบ่ง 4 ช่อง (Star/Opportunity/Waste/Low Priority) ของกราฟด้านล่าง — โฆษณาที่ spend/view rate
                      &quot;มากกว่าหรือเท่ากับ&quot; ทั้งสองค่านี้ = Star (ดีทั้งคู่), เกินแค่ spend = Waste (จ่ายเยอะแต่ดูไม่จบ),
                      เกินแค่ view rate = Opportunity (ดูจบดีแต่ยังจ่ายน้อย น่าเพิ่มงบ), ไม่เกินทั้งคู่ = Low Priority
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-black mb-1">
                        Spend Threshold (฿) <span className="text-gray-400 font-normal">— งบที่ใช้ไปต่อโฆษณา ถือว่า &quot;เยอะ&quot;</span>
                      </label>
                      <input
                        type="number"
                        value={thresholdDraft.spend}
                        onChange={(e) => setThresholdDraft((d) => ({ ...d, spend: e.target.value }))}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-black mb-1">
                        View Rate Threshold (%) <span className="text-gray-400 font-normal">— % คนดูจบ ถือว่า &quot;ดี&quot;</span>
                      </label>
                      <input
                        type="number"
                        value={thresholdDraft.rate}
                        onChange={(e) => setThresholdDraft((d) => ({ ...d, rate: e.target.value }))}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <button
                      onClick={() => saveThresholds(false)}
                      disabled={savingThresholds}
                      className="text-sm bg-secondary hover:bg-secondary-light disabled:bg-gray-400 text-white font-medium px-4 py-1.5 rounded-lg"
                    >
                      Save
                    </button>
                    {data.quadrant_thresholds.is_custom && (
                      <button
                        onClick={() => saveThresholds(true)}
                        disabled={savingThresholds}
                        className="text-sm text-gray-500 underline"
                      >
                        Reset เป็นค่าอัตโนมัติ
                      </button>
                    )}
                    <p className="text-xs text-gray-400 w-full">
                      {data.quadrant_thresholds.is_custom ? "กำหนดเองโดย admin" : "ค่าอัตโนมัติ (ค่ากลางของ spend / 25%)"}
                    </p>
                    {/* EC11 */}
                    {thresholdError && <p className="text-xs text-red-600 w-full font-medium">⚠ {thresholdError}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    Threshold ปัจจุบัน: Spend ฿{data.quadrant_thresholds.spend_threshold} · View Rate{" "}
                    {data.quadrant_thresholds.rate_threshold}% (ต้องเป็น admin ถึงจะแก้ไขได้)
                  </p>
                )}

                {/* Kept off-chart when the cross is forced to dead-center (see
                    qv.maxX/Y comment) — still counted in the summary
                    boxes and Ad Detail table below, just not plotted as a dot. */}
                {qv.outliers > 0 && (
                  <p className="text-xs text-amber-600">
                    ⚠ {qv.outliers} ad มี spend/{yAxisModeLabel(yAxisMode)} สูงเกินกราฟ (เพื่อให้เส้นแบ่งอยู่กึ่งกลางเสมอ) — ดูรายละเอียดได้ในตาราง Ad Detail ด้านล่าง
                  </p>
                )}

                {/* Callout pills — top row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-500 text-white text-xs font-medium rounded-full px-4 py-2 text-center">
                    {yAxisModeLabel(yAxisMode)} สูง + ใช้งบต่ำ · คอนเทนต์ดี แต่งบน้อยเกินไป
                  </div>
                  <div className="bg-green-600 text-white text-xs font-medium rounded-full px-4 py-2 text-center">
                    {yAxisModeLabel(yAxisMode)} สูง + ใช้งบสูง · แต่คุ้มค่า
                  </div>
                </div>

                <div style={{ width: "100%", height: 480 }}>
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 10, right: 30, bottom: 40, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis
                        type="number"
                        dataKey="spend"
                        name="Spend"
                        domain={[0, qv.maxX]}
                        tick={{ fontSize: 11, fill: "#000" }}
                        label={{ value: "Spend (งบประมาณ)", position: "insideBottom", offset: -5, fill: "#000" }}
                      />
                      <YAxis
                        type="number"
                        dataKey={yAxisMode}
                        name={yAxisModeLabel(yAxisMode)}
                        domain={[0, qv.maxY]}
                        tick={{ fontSize: 11, fill: "#000" }}
                        label={{
                          value: `${yAxisModeLabel(yAxisMode)} (%)`,
                          angle: -90,
                          position: "insideLeft",
                          fill: "#000",
                        }}
                      />
                      <ZAxis range={[80, 80]} />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const d = payload[0].payload as QuadrantPoint;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs w-40">
                              {d.videoCoverUrl ? (
                                <img
                                  src={d.videoCoverUrl}
                                  alt=""
                                  className="w-full h-32 object-cover rounded mb-2"
                                />
                              ) : (
                                d.videoLink && (
                                  <div className="w-full h-32 bg-gray-900 rounded mb-2 flex items-center justify-center text-white text-2xl">
                                    ▶
                                  </div>
                                )
                              )}
                              <p className="font-semibold text-black mb-1 truncate">{d.adName}</p>
                              <p className="text-black">Spend: {fmtCurrency(d.spend)}</p>
                              <p className="text-black">
                                {yAxisModeLabel(yAxisMode)}:{" "}
                                {(d[yAxisMode] as number).toFixed(1)}%
                              </p>
                              <p className="text-black font-semibold mt-1">{d.quadrant}</p>
                              {(d.videoLink || d.videoCoverUrl) && (
                                <p className="text-secondary mt-1">คลิกดูวิดีโอ →</p>
                              )}
                            </div>
                          );
                        }}
                      />

                      {/* Shaded quadrant zones — each fill matches that quadrant's dot/legend color exactly */}
                      <ReferenceArea
                        x1={0} x2={qv.xThreshold} y1={qv.yThreshold} y2={qv.maxY}
                        fill="#2563eb" fillOpacity={0.12}
                        label={{ value: "Opportunity (Increase Budget)", position: "insideTopLeft", fill: "#1e40af", fontSize: 12, fontWeight: 600 }}
                      />
                      <ReferenceArea
                        x1={qv.xThreshold} x2={qv.maxX} y1={qv.yThreshold} y2={qv.maxY}
                        fill="#16a34a" fillOpacity={0.12}
                        label={{ value: "Star (Scale)", position: "insideTopRight", fill: "#166534", fontSize: 12, fontWeight: 600 }}
                      />
                      <ReferenceArea
                        x1={0} x2={qv.xThreshold} y1={0} y2={qv.yThreshold}
                        fill="#9ca3af" fillOpacity={0.12}
                        label={{ value: "Low Priority", position: "insideBottomLeft", fill: "#4b5563", fontSize: 12, fontWeight: 600 }}
                      />
                      <ReferenceArea
                        x1={qv.xThreshold} x2={qv.maxX} y1={0} y2={qv.yThreshold}
                        fill="#dc2626" fillOpacity={0.12}
                        label={{ value: "Waste (Stop/Fix)", position: "insideBottomRight", fill: "#991b1b", fontSize: 12, fontWeight: 600 }}
                      />

                      <ReferenceLine
                        x={qv.xThreshold}
                        stroke="#94a3b8"
                        strokeDasharray="5 5"
                      />
                      <ReferenceLine
                        y={qv.yThreshold}
                        stroke="#94a3b8"
                        strokeDasharray="5 5"
                      />
                      <Scatter
                        data={qv.points}
                        cursor="pointer"
                        onClick={(d) => {
                          const item = d as unknown as QuadrantPoint;
                          // Prefer the watchable video page (Spark Ads' TikTok embed) over
                          // just opening the still image, so "click to watch" actually plays.
                          const url = item.videoLink || item.videoCoverUrl;
                          if (url) window.open(url, "_blank");
                        }}
                      >
                        {qv.points.map((entry, idx) => {
                          const color =
                            entry.quadrant === "Star"
                              ? "#16a34a"
                              : entry.quadrant === "Opportunity"
                                ? "#2563eb"
                                : entry.quadrant === "Waste"
                                  ? "#dc2626"
                                  : "#9ca3af";
                          return <Cell key={idx} fill={color} />;
                        })}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                {/* Callout pills — bottom row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-500 text-white text-xs font-medium rounded-full px-4 py-2 text-center">
                    {yAxisModeLabel(yAxisMode)} ต่ำ + ใช้งบต่ำ · คอนเทนต์ยังไม่ติด
                  </div>
                  <div className="bg-red-600 text-white text-xs font-medium rounded-full px-4 py-2 text-center">
                    {yAxisModeLabel(yAxisMode)} ต่ำ + ใช้งบสูง · ควรปิดโฆษณา
                  </div>
                </div>

                {/* Legend — centered under the chart rather than pinned to
                    the left edge of a much wider row. */}
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
                  {[
                    { label: "Star", color: "#16a34a" },
                    { label: "Opportunity", color: "#2563eb" },
                    { label: "Waste", color: "#dc2626" },
                    { label: "Low Priority", color: "#9ca3af" },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full" style={{ background: l.color }} />
                      <span className="text-black">{l.label}</span>
                    </div>
                  ))}
                </div>

                {/* Quadrant summary — F18: click a box to filter the ad table below */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(["Star", "Opportunity", "Waste", "Low Priority"] as const).map((q) => {
                    const count = qv.scoped.filter((r) => r.quadrant === q).length;
                    const active = quadrantFilter === q;
                    return (
                      <button
                        key={q}
                        onClick={() => setQuadrantFilter(active ? null : q)}
                        className={`border rounded-xl p-3 text-center transition-all ${quadrantColor(q)} ${
                          active ? "ring-2 ring-offset-1 ring-secondary" : "hover:opacity-80"
                        }`}
                      >
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-xs font-medium mt-0.5">{q}</p>
                      </button>
                    );
                  })}
                </div>
                {quadrantFilter && (
                  <p className="text-xs text-gray-500">
                    กำลัง filter ตาราง Ad Detail ด้านล่างเฉพาะ &quot;{quadrantFilter}&quot; —{" "}
                    <button onClick={() => setQuadrantFilter(null)} className="text-secondary underline">
                      ล้าง filter
                    </button>
                  </p>
                )}
              </div>
                  );
                }}
              </DashboardSection>
            )}
          </div>
        </div>

        {/* Ad Table (always visible at bottom) */}
        <DashboardSection
          {...sectionProps}
          title="Ad Detail"
          subtitle={(d) => {
            const rows = scopeAds(d, campaignFilter, adgroupFilter).filter(
              (r) => !quadrantFilter || r.quadrant === quadrantFilter,
            );
            return `${rows.length} ads${
              rows.length !== d.by_ad.length ? ` (filtered จาก ${d.by_ad.length})` : ""
            }`;
          }}
        >
          {(d) => {
            const rows = scopeAds(d, campaignFilter, adgroupFilter).filter(
              (r) => !quadrantFilter || r.quadrant === quadrantFilter,
            );
            if (d.by_ad.length === 0) return null; // the empty/syncing states below cover this
            if (rows.length === 0) {
              return <p className="text-sm text-black py-6 text-center">ไม่มี Ad ที่ตรงกับ filter ที่เลือก</p>;
            }
            return (
              <SortableTable
                data={rows}
                defaultSort={[{ id: "spend", desc: true }]}
                columns={adTableColumns}
                stickyHeader
                stickyFirstColumn
              />
            );
          }}
        </DashboardSection>

        {/* EC9/AC13: first connection, sync already running in the
            background — distinct from "no data + nothing running" below,
            so the dashboard never just looks empty/broken while it's
            actually working. */}
        {data && data.by_ad.length === 0 && !loading && statusInfo.syncing && (
          <div className={`${SECTION_CARD} text-center`}>
            <p className="text-black text-sm font-medium mb-2">กำลังดึงข้อมูลครั้งแรก...</p>
            <p className="text-gray-500 text-xs mb-4">
              {statusInfo.status_detail ??
                (statusInfo.progress?.total
                  ? `Sync แล้ว ${statusInfo.progress.completed}/${statusInfo.progress.total} ad account`
                  : "กำลังเริ่ม sync — อาจใช้เวลาสักครู่สำหรับข้อมูลย้อนหลังจำนวนมาก")}
            </p>
            {statusInfo.progress?.total ? (
              <div className="max-w-xs mx-auto bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-secondary h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (statusInfo.progress.completed / statusInfo.progress.total) * 100)}%` }}
                />
              </div>
            ) : (
              <div className="max-w-xs mx-auto bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-secondary h-full w-1/3 rounded-full animate-pulse" />
              </div>
            )}
          </div>
        )}

        {data && data.by_ad.length === 0 && !loading && !statusInfo.syncing && (
          <div className={`${SECTION_CARD} text-center`}>
            <p className="text-black text-sm mb-3">ยังไม่มีข้อมูล TikTok Ads</p>
            {isAdmin ? (
              <button
                onClick={() => router.push("/tiktok/sync")}
                className="text-sm bg-secondary text-white font-semibold px-4 py-2 rounded-xl hover:bg-secondary-light transition-colors"
              >
                ไป Sync Data ก่อน
              </button>
            ) : (
              <p className="text-sm text-gray-500">กรุณาติดต่อ admin เพื่อเชื่อมต่อและ sync ข้อมูล</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function yAxisModeLabel(mode: ViewRateMode): string {
  switch (mode) {
    case "view_2s_rate":
      return "2s View Rate";
    case "view_6s_rate":
      return "6s View Rate";
    case "view_50_rate":
      return "50% View Rate";
    case "view_100_rate":
      return "100% View Rate";
  }
}
