/**
 * lib/tiktok-metrics.ts
 * Shared per-ad aggregation + F17 quadrant classification (Spend × 50% View
 * Rate), pulled out of app/api/tiktok/dashboard/route.ts so the CSV export
 * route can produce the exact same numbers instead of re-deriving them (and
 * risking the two silently drifting apart).
 */

type Row = Record<string, unknown>;

export interface AdMetricRow {
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
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Aggregate raw tiktok_ads_rawdata rows into one row per ad, with view-rate
 * percentages, CTR/CPC, and the F17 quadrant classification (Spend × 50%
 * View Rate — admin-configurable threshold, defaulting to the midpoint of
 * each axis's max value).
 */
export function computeAdMetrics(
  rows: Row[],
  quadrantSettings: { spend_threshold?: number | null; rate_threshold?: number | null } | null,
): { byAd: AdMetricRow[]; spendThreshold: number; rateThreshold: number } {
  type AdAcc = Omit<AdMetricRow, "view_2s_rate" | "view_6s_rate" | "view_50_rate" | "view_100_rate" | "ctr" | "cpc" | "quadrant">;
  const adMap = new Map<string, AdAcc>();

  for (const r of rows) {
    const key = `${String(r.advertiser_id ?? "")}__${String(r.ad_id ?? "")}`;
    const e = adMap.get(key);
    if (e) {
      e.spend += num(r.spend);
      e.impressions += num(r.impressions);
      e.reach += num(r.reach);
      e.video_views += num(r.video_views);
      e.video_watched_2s += num(r.video_watched_2s);
      e.video_watched_6s += num(r.video_watched_6s);
      e.video_view_p50 += num(r.video_view_p50);
      e.video_view_p100 += num(r.video_view_p100);
      e.likes += num(r.likes);
      e.comments += num(r.comments);
      e.shares += num(r.shares);
      e.follows += num(r.follows);
      e.clicks += num(r.clicks);
    } else {
      adMap.set(key, {
        ad_id: String(r.ad_id ?? ""),
        ad_name: String(r.ad_name ?? ""),
        advertiser_id: String(r.advertiser_id ?? ""),
        advertiser_name: String(r.advertiser_name ?? ""),
        campaign_id: String(r.campaign_id ?? ""),
        campaign_name: String(r.campaign_name ?? ""),
        adgroup_name: String(r.adgroup_name ?? ""),
        spend: num(r.spend),
        impressions: num(r.impressions),
        reach: num(r.reach),
        video_views: num(r.video_views),
        video_watched_2s: num(r.video_watched_2s),
        video_watched_6s: num(r.video_watched_6s),
        video_view_p50: num(r.video_view_p50),
        video_view_p100: num(r.video_view_p100),
        likes: num(r.likes),
        comments: num(r.comments),
        shares: num(r.shares),
        follows: num(r.follows),
        clicks: num(r.clicks),
      });
    }
  }

  const ratedAds = [...adMap.values()].map((a) => ({
    ...a,
    view_2s_rate: round2(a.video_views > 0 ? (a.video_watched_2s / a.video_views) * 100 : 0),
    view_6s_rate: round2(a.video_views > 0 ? (a.video_watched_6s / a.video_views) * 100 : 0),
    view_50_rate: round2(a.video_views > 0 ? (a.video_view_p50 / a.video_views) * 100 : 0),
    view_100_rate: round2(a.video_views > 0 ? (a.video_view_p100 / a.video_views) * 100 : 0),
    ctr: round2(a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0),
    cpc: round2(a.clicks > 0 ? a.spend / a.clicks : 0),
  }));

  // Default threshold (when the admin hasn't set one) is the midpoint of the
  // highest value on each axis — e.g. max spend ฿2,000 → default threshold
  // ฿1,000 — so it always lines up with the dashboard chart's visual center.
  const maxSpend = ratedAds.length > 0 ? Math.max(...ratedAds.map((a) => a.spend)) : 0;
  const maxRate = ratedAds.length > 0 ? Math.max(...ratedAds.map((a) => a.view_50_rate)) : 0;
  const spendThreshold = quadrantSettings?.spend_threshold ?? maxSpend / 2;
  const rateThreshold = quadrantSettings?.rate_threshold ?? maxRate / 2;

  const byAd: AdMetricRow[] = ratedAds.map((a) => {
    let quadrant: AdMetricRow["quadrant"] = "Low Priority";
    if (a.spend >= spendThreshold && a.view_50_rate >= rateThreshold) quadrant = "Star";
    else if (a.spend < spendThreshold && a.view_50_rate >= rateThreshold) quadrant = "Opportunity";
    else if (a.spend >= spendThreshold && a.view_50_rate < rateThreshold) quadrant = "Waste";
    return { ...a, quadrant };
  });

  return { byAd, spendThreshold, rateThreshold };
}
