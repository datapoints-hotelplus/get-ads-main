import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const FB_GRAPH_API = "https://graph.facebook.com/v18.0";

interface RawInsight {
  account_id: string;
  account_name: string;
  campaign_name: string;
  spend: string;
  reach: string;
  impressions: string;
  inline_link_clicks: string;
  frequency: string;
  date_start: string;
  date_stop: string;
  region?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}

function extractPurchase(actions: RawInsight["actions"]) {
  return parseFloat(
    actions?.find((a) => a.action_type === "purchase")?.value ?? "0",
  );
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");

  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "FB_ACCESS_TOKEN not configured" },
      { status: 500 },
    );
  }

  const cleanId = accountId.replace(/^act_/, "");

  try {
    // Fetch campaign-level aggregation
    const [campaignRes, regionRes] = await Promise.all([
      axios.get(`${FB_GRAPH_API}/act_${cleanId}/insights`, {
        params: {
          level: "campaign",
          fields: [
            "account_id",
            "account_name",
            "campaign_name",
            "spend",
            "reach",
            "impressions",
            "inline_link_clicks",
            "clicks",
            "frequency",
            "actions",
            "action_values",
            "date_start",
            "date_stop",
          ].join(","),
          limit: 100,
          access_token: accessToken,
        },
      }),
      axios.get(`${FB_GRAPH_API}/act_${cleanId}/insights`, {
        params: {
          level: "account",
          fields: [
            "account_id",
            "account_name",
            "spend",
            "reach",
            "impressions",
            "inline_link_clicks",
            "clicks",
            "actions",
            "action_values",
            "date_start",
            "date_stop",
          ].join(","),
          breakdowns: "region",
          limit: 100,
          access_token: accessToken,
        },
      }),
    ]);

    const campaignRows: RawInsight[] = campaignRes.data.data;
    const regionRows: RawInsight[] = regionRes.data.data;

    // Overall totals
    const totals = campaignRows.reduce(
      (acc, item) => {
        const spend = parseFloat(item.spend ?? "0");
        const clicks = parseInt(item.inline_link_clicks ?? "0", 10);
        const clicks_all = clicks;
        const impressions = parseInt(item.impressions ?? "0", 10);
        const purchases = extractPurchase(item.actions);
        const revenue = extractPurchase(item.action_values);

        acc.spend += spend;
        acc.reach += parseInt(item.reach ?? "0", 10);
        acc.impressions += impressions;
        acc.clicks += clicks;
        acc.clicks_all += clicks_all;
        acc.purchases += purchases;
        acc.revenue += revenue;
        return acc;
      },
      {
        spend: 0,
        reach: 0,
        impressions: 0,
        clicks: 0,
        clicks_all: 0,
        purchases: 0,
        revenue: 0,
      },
    );

    const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    const ctr =
      totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks_all > 0 ? totals.spend / totals.clicks_all : 0;
    const costPerPurchase =
      totals.purchases > 0 ? totals.spend / totals.purchases : 0;

    // By campaign
    const byCampaign = campaignRows.map((item) => {
      const spend = parseFloat(item.spend ?? "0");
      const clicks = parseInt(item.inline_link_clicks ?? "0", 10);
      const impressions = parseInt(item.impressions ?? "0", 10);
      const purchases = extractPurchase(item.actions);
      const revenue = extractPurchase(item.action_values);

      return {
        campaign_name: item.campaign_name,
        spend,
        reach: parseInt(item.reach ?? "0", 10),
        impressions,
        clicks,
        purchases,
        revenue,
        roas: spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0,
        ctr:
          impressions > 0
            ? parseFloat(((clicks / impressions) * 100).toFixed(2))
            : 0,
      };
    });

    // By region (top 10 by spend)
    const byRegion = regionRows
      .map((item) => ({
        region: item.region ?? "-",
        spend: parseFloat(item.spend ?? "0"),
        reach: parseInt(item.reach ?? "0", 10),
        impressions: parseInt(item.impressions ?? "0", 10),
        clicks: parseInt(item.inline_link_clicks ?? "0", 10),
        purchases: extractPurchase(item.actions),
        revenue: extractPurchase(item.action_values),
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    const dateStart = campaignRows[0]?.date_start ?? "";
    const dateStop = campaignRows[0]?.date_stop ?? "";
    const accountName = campaignRows[0]?.account_name ?? cleanId;

    return NextResponse.json({
      account_id: cleanId,
      account_name: accountName,
      date_start: dateStart,
      date_stop: dateStop,
      totals: {
        spend: parseFloat(totals.spend.toFixed(2)),
        reach: totals.reach,
        impressions: totals.impressions,
        clicks: totals.clicks,
        purchases: totals.purchases,
        revenue: parseFloat(totals.revenue.toFixed(2)),
        roas: parseFloat(roas.toFixed(2)),
        ctr: parseFloat(ctr.toFixed(2)),
        cpc: parseFloat(cpc.toFixed(2)),
        cost_per_purchase: parseFloat(costPerPurchase.toFixed(2)),
      },
      by_campaign: byCampaign,
      by_region: byRegion,
    });
  } catch (error: any) {
    const fbError = error.response?.data?.error;
    return NextResponse.json(
      { error: fbError?.message ?? error.message },
      { status: 500 },
    );
  }
}
