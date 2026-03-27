import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const FB_GRAPH_API = "https://graph.facebook.com/v18.0";

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
    const response = await axios.get(
      `${FB_GRAPH_API}/act_${cleanId}/insights`,
      {
        params: {
          level: "ad",
          fields: [
            "account_id",
            "account_name",
            "campaign_name",
            "ad_name",
            "spend",
            "frequency",
            "reach",
            "impressions",
            "inline_link_clicks",
            "actions",
            "action_values",
            "date_start",
            "date_stop",
          ].join(","),
          breakdowns: "region",
          limit: 10,
          access_token: accessToken,
        },
      },
    );

    const ads = (response.data.data as any[]).map((item) => {
      const spend = parseFloat(item.spend ?? "0");
      const clicks = parseInt(item.inline_link_clicks ?? "0", 10);
      const impressions = parseInt(item.impressions ?? "0", 10);

      const purchaseAction = (item.actions as any[] | undefined)?.find(
        (a) => a.action_type === "purchase",
      );
      const purchaseValueAction = (item.action_values as any[] | undefined)?.find(
        (a) => a.action_type === "purchase",
      );

      const purchases = parseFloat(purchaseAction?.value ?? "0");
      const revenue = parseFloat(purchaseValueAction?.value ?? "0");

      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const costPerPurchase = purchases > 0 ? spend / purchases : 0;
      const roas = spend > 0 ? revenue / spend : 0;

      return {
        account_id: item.account_id,
        account_name: item.account_name,
        campaign_name: item.campaign_name,
        ad_name: item.ad_name,
        region: item.region ?? "-",
        date_start: item.date_start,
        date_stop: item.date_stop,
        spend,
        frequency: parseFloat(parseFloat(item.frequency ?? "0").toFixed(2)),
        reach: parseInt(item.reach ?? "0", 10),
        impressions,
        inline_link_clicks: clicks,
        purchases,
        revenue,
        ctr: parseFloat(ctr.toFixed(2)),
        cpc: parseFloat(cpc.toFixed(2)),
        cost_per_purchase: parseFloat(costPerPurchase.toFixed(2)),
        roas: parseFloat(roas.toFixed(2)),
      };
    });

    return NextResponse.json({ data: ads });
  } catch (error: any) {
    const fbError = error.response?.data?.error;
    return NextResponse.json(
      { error: fbError?.message ?? error.message },
      { status: 500 },
    );
  }
}
