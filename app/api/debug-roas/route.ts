import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getSupabase } from "@/lib/supabase";
import { getFacebookAccessToken } from "@/lib/facebook-token";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

type FBAction = { action_type: string; value: string };
type FBItem = {
  account_name?: string;
  campaign_name?: string;
  spend?: string;
  actions?: FBAction[];
  action_values?: FBAction[];
  conversion_values?: FBAction[];
} & Record<string, unknown>;

// GET /api/debug-roas?accountName=<name>&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const accessToken = await getFacebookAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing FB_ACCESS_TOKEN" },
      { status: 400 },
    );
  }

  const { searchParams } = request.nextUrl;
  const accountName = searchParams.get("accountName");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  if (!accountName || !dateFrom || !dateTo) {
    return NextResponse.json(
      {
        error:
          "Required: accountName, dateFrom, dateTo. e.g. /api/debug-roas?accountName=XYZ&dateFrom=2026-05-01&dateTo=2026-05-10",
      },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const { data: page } = await supabase
    .from("ads_allpage")
    .select("account_id, account_name")
    .eq("account_name", accountName)
    .single();

  if (!page) {
    return NextResponse.json(
      { error: `Account not found: ${accountName}` },
      { status: 404 },
    );
  }

  const timeRange = encodeURIComponent(
    JSON.stringify({ since: dateFrom, until: dateTo }),
  );

  const url =
    `${FB_GRAPH_API}/act_${page.account_id}/insights?` +
    `fields=campaign_name,spend,actions,action_values,conversion_values` +
    `&time_range=${timeRange}&level=campaign&limit=50&access_token=${accessToken}`;

  try {
    const res = await axios.get(url, { timeout: 30000 });
    const items = (res.data.data ?? []) as FBItem[];

    // Collect ALL unique action_types seen
    const actionTypes = new Set<string>();
    const actionValueTypes = new Set<string>();
    const conversionValueTypes = new Set<string>();

    let totalSpend = 0;
    let totalActionValuePurchase = 0;
    let totalConversionValuePurchase = 0;

    const samples = items.slice(0, 5).map((item) => {
      (item.actions ?? []).forEach((a) => actionTypes.add(a.action_type));
      (item.action_values ?? []).forEach((a) =>
        actionValueTypes.add(a.action_type),
      );
      (item.conversion_values ?? []).forEach((a) =>
        conversionValueTypes.add(a.action_type),
      );

      return {
        campaign_name: item.campaign_name,
        spend: item.spend,
        actions: item.actions,
        action_values: item.action_values,
        conversion_values: item.conversion_values,
      };
    });

    for (const item of items) {
      totalSpend += parseFloat(String(item.spend ?? "0"));
      (item.actions ?? []).forEach((a) => actionTypes.add(a.action_type));
      (item.action_values ?? []).forEach((a) => {
        actionValueTypes.add(a.action_type);
        if (
          a.action_type === "purchase" ||
          a.action_type === "offsite_conversion.fb_pixel_purchase"
        ) {
          totalActionValuePurchase += parseFloat(String(a.value ?? "0"));
        }
      });
      (item.conversion_values ?? []).forEach((a) => {
        conversionValueTypes.add(a.action_type);
        if (
          a.action_type === "purchase" ||
          a.action_type === "offsite_conversion.fb_pixel_purchase"
        ) {
          totalConversionValuePurchase += parseFloat(String(a.value ?? "0"));
        }
      });
    }

    // Diagnosis
    let diagnosis = "";
    if (actionValueTypes.size === 0 && conversionValueTypes.size === 0) {
      diagnosis =
        "❌ Facebook ไม่ส่ง action_values หรือ conversion_values เลย → Pixel ไม่ได้ track conversion";
    } else if (
      totalActionValuePurchase === 0 &&
      totalConversionValuePurchase === 0
    ) {
      diagnosis = `⚠️ Facebook ส่งข้อมูล action types: [${[...actionValueTypes, ...conversionValueTypes].join(", ")}] แต่ไม่มี "purchase" → ต้องเช็คชื่อ action_type ที่ถูก`;
    } else {
      const computed = totalActionValuePurchase || totalConversionValuePurchase;
      diagnosis = `✅ Facebook ส่ง purchase value: ${computed} → ROAS = ${(computed / totalSpend).toFixed(2)}x → ต้อง re-sync DB`;
    }

    return NextResponse.json({
      accountName,
      accountId: page.account_id,
      dateRange: { from: dateFrom, to: dateTo },
      itemCount: items.length,
      totalSpend,
      totals: {
        action_values_purchase: totalActionValuePurchase,
        conversion_values_purchase: totalConversionValuePurchase,
        computed_roas:
          totalSpend > 0
            ? (totalActionValuePurchase || totalConversionValuePurchase) /
              totalSpend
            : 0,
      },
      uniqueActionTypes: {
        actions: [...actionTypes].sort(),
        action_values: [...actionValueTypes].sort(),
        conversion_values: [...conversionValueTypes].sort(),
      },
      diagnosis,
      samples,
    });
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    return NextResponse.json(
      {
        error: "Facebook API error",
        details: err.response?.data ?? err.message,
      },
      { status: 500 },
    );
  }
}
