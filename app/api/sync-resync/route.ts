import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getSupabase } from "@/lib/supabase";
import { getFacebookAccessToken } from "@/lib/facebook-token";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

type FBAction = { action_type: string; value: string };
type FBItem = { actions?: FBAction[]; action_values?: FBAction[] } & Record<
  string,
  unknown
>;

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}

function findAction(arr: FBAction[] | undefined, type: string): number {
  if (!arr) return 0;
  const variants =
    type === "purchase"
      ? [
          "omni_purchase",
          "purchase",
          "offsite_conversion.fb_pixel_purchase",
          "onsite_web_purchase",
          "web_in_store_purchase",
        ]
      : [type];
  for (const variant of variants) {
    const found = arr.find((a) => a.action_type === variant);
    if (found) return num(found.value);
  }
  return 0;
}

export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountNames = searchParams.getAll("account");

  try {
    const supabase = getSupabase();
    const accessToken = await getFacebookAccessToken();

    if (!accessToken) {
      return NextResponse.json(
        { error: "No Facebook access token" },
        { status: 401 }
      );
    }

    // Calculate 6 months ago
    const today = new Date();
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
    const dateFrom = sixMonthsAgo.toISOString().split("T")[0];
    const dateTo = today.toISOString().split("T")[0];

    console.log(`[sync-resync] Syncing last 6 months from ${dateFrom} to ${dateTo}...`);

    // Get all active accounts
    let accounts: { account_name: string; account_id: string }[] = [];
    if (accountNames.length > 0) {
      const { data } = await supabase
        .from("ads_allpage")
        .select("account_name, account_id")
        .in("account_name", accountNames)
        .eq("is_active", true);
      accounts = data ?? [];
    } else {
      const { data } = await supabase
        .from("ads_allpage")
        .select("account_name, account_id")
        .eq("is_active", true);
      accounts = data ?? [];
    }

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: "No active accounts found" },
        { status: 404 }
      );
    }

    const FIELDS = [
      "ad_id",
      "ad_name",
      "campaign_name",
      "campaign_id",
      "adset_name",
      "adset_id",
      "date_start",
      "date_stop",
      "spend",
      "impressions",
      "inline_link_clicks",
      "reach",
      "frequency",
      "actions",
      "action_values",
      "conversion_values",
    ].join(",");

    const summary: {
      account: string;
      rows_fetched: number;
      rows_updated: number;
      error?: string;
    }[] = [];

    let totalFetched = 0;
    let totalUpdated = 0;

    // Process each account
    for (const acc of accounts) {
      const accountId = (acc.account_id as string).replace(/^act_/, "");

      try {
        console.log(`[sync-resync] Syncing ${acc.account_name} (${accountId})...`);

        const timeRange = encodeURIComponent(
          JSON.stringify({ since: dateFrom, until: dateTo })
        );
        const url =
          `${FB_GRAPH_API}/act_${accountId}/insights?` +
          `fields=${FIELDS}` +
          `&time_range=${timeRange}` +
          `&level=ad&limit=1000` +
          `&access_token=${accessToken}`;

        const response: { data: { data?: FBItem[] } } = await axios.get(url, {
          timeout: 30000,
        });

        const items = response.data.data ?? [];
        let updated = 0;
        let inserted = 0;

        for (const item of items) {
          const spend = num(item.spend);
          if (spend === 0) continue;

          const purchases = findAction(item.actions, "purchase");
          const purchase_value =
            findAction(item.action_values, "purchase") ||
            findAction(
              (item as unknown as { conversion_values?: FBAction[] })
                .conversion_values,
              "purchase"
            );

          const ad_id = String(item.ad_id ?? "");
          const date_start = String(item.date_start ?? "");

          const newPurchases = parseInt(String(purchases), 10);
          const newPurchaseValue = purchase_value;

          // Check if row exists
          const { data: existing } = await supabase
            .from("ads_rawdata")
            .select("id, purchases, purchase_value")
            .eq("account_name", acc.account_name)
            .eq("ad_id", ad_id)
            .eq("date_start", date_start)
            .single();

          if (existing) {
            // Compare purchases and purchase_value only
            const oldPurchases = existing.purchases ?? 0;
            const oldPurchaseValue = existing.purchase_value ?? 0;

            if (oldPurchases === newPurchases && oldPurchaseValue === newPurchaseValue) {
              // Values unchanged, skip
              continue;
            }

            // Values changed, update row
            const { error: upErr } = await supabase
              .from("ads_rawdata")
              .update({
                purchases: newPurchases,
                purchase_value: newPurchaseValue,
              })
              .eq("id", existing.id);

            if (!upErr) {
              updated++;
              totalUpdated++;
            }
          }
        }

        totalFetched += items.length;
        summary.push({
          account: acc.account_name,
          rows_fetched: items.length,
          rows_updated: updated,
        });

        console.log(
          `[sync-resync] ${acc.account_name}: fetched ${items.length}, updated ${updated}, inserted ${inserted}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[sync-resync] Error for ${acc.account_name}:`, msg);
        summary.push({
          account: acc.account_name,
          rows_fetched: 0,
          rows_updated: 0,
          error: msg,
        });
      }
    }

    const result = {
      success: true,
      dateFrom,
      dateTo,
      totalFetched,
      totalUpdated,
      accounts_synced: summary.length,
      summary,
      timestamp: new Date().toISOString(),
    };

    // Send notification to webhook
    try {
      await fetch('https://www.grit-craft.com/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'sync_resync_completed',
          severity: 'info',
          data: result,
        }),
      });
    } catch (notifyErr) {
      console.error('[sync-resync] Webhook notification failed:', notifyErr);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[sync-resync]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
      },
      { status: 500 }
    );
  }
}
