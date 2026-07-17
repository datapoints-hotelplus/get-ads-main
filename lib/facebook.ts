import axios from "axios";

interface FacebookPageData {
  id: string;
  name: string;
  likes: number;
  followers: number;
  biography: string;
  website: string;
  picture: string;
}

interface FacebookPost {
  id: string;
  message: string;
  created_time: string;
  likes: number;
  comments: number;
  shares: number;
}

const FB_GRAPH_API = "https://graph.facebook.com/v18.0";

/**
 * Fetch Facebook page data
 */
export async function getFacebookPageData(
  pageId: string,
  accessToken: string,
): Promise<FacebookPageData> {
  try {
    const response = await axios.get(`${FB_GRAPH_API}/${pageId}`, {
      params: {
        fields:
          "id,name,likes,followers,biography,website,picture.height(200).width(200)",
        access_token: accessToken,
      },
    });

    return {
      id: response.data.id,
      name: response.data.name,
      likes: response.data.likes || 0,
      followers: response.data.followers || 0,
      biography: response.data.biography || "",
      website: response.data.website || "",
      picture: response.data.picture?.data?.url || "",
    };
  } catch (error: any) {
    console.error(`Error fetching Facebook page ${pageId}:`, error.message);
    throw new Error(`Failed to fetch Facebook page data: ${error.message}`);
  }
}

/**
 * Fetch recent posts from Facebook page
 */
export async function getFacebookPagePosts(
  pageId: string,
  accessToken: string,
  limit: number = 10,
): Promise<FacebookPost[]> {
  try {
    const response = await axios.get(`${FB_GRAPH_API}/${pageId}/posts`, {
      params: {
        fields:
          "id,message,created_time,likes.summary(true).limit(0),comments.summary(true).limit(0),shares",
        access_token: accessToken,
        limit,
      },
    });

    return response.data.data.map((post: any) => ({
      id: post.id,
      message: post.message || "",
      created_time: post.created_time,
      likes: post.likes?.summary?.total_count || 0,
      comments: post.comments?.summary?.total_count || 0,
      shares: post.shares?.count || 0,
    }));
  } catch (error: any) {
    console.error(
      `Error fetching Facebook posts for ${pageId}:`,
      error.message,
    );
    throw new Error(`Failed to fetch Facebook posts: ${error.message}`);
  }
}

export async function getAllFacebookPagesData(
  pageIds: string[],
  accessToken: string,
) {
  const data = [];

  for (const pageId of pageIds) {
    try {
      const pageData = await getFacebookPageData(pageId, accessToken);
      const posts = await getFacebookPagePosts(pageId, accessToken, 5);

      data.push({
        page: pageData,
        posts,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error(`Error processing page ${pageId}:`, error.message);
    }
  }

  return data;
}

const FB_GRAPH_API_V25 = "https://graph.facebook.com/v25.0";

/**
 * Fetch real unique reach for a list of ad account IDs over a date range.
 * Calls the Facebook Insights API at account level (not summed from raw rows).
 */
export async function fetchAccountReach(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
): Promise<number> {
  let total = 0;
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=reach` +
      `&time_range=${timeRange}&level=account&access_token=${accessToken}`;

    while (url) {
      const res: {
        data: { data?: { reach?: string }[]; paging?: { next?: string } };
      } = await axios.get(url);
      for (const item of res.data.data ?? []) {
        total += parseInt(String(item.reach ?? "0"), 10);
      }
      url = res.data.paging?.next ?? null;
    }
  }

  return total;
}

/**
 * Fetch reach + clicks (all clicks = clicks_all) in a single API call per account.
 * Using time_increment=all_days avoids double-counting across daily rows.
 */
export async function fetchAccountReachAndClicks(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
  options?: { campaignNames?: string[]; adsetName?: string },
): Promise<{ reach: number; clicks: number; impressions: number }> {
  let totalReach = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  const campaignNames = options?.campaignNames ?? [];
  let level = "account";
  let filteringParam = "";
  if (options?.adsetName) {
    level = "adset";
    const filters: { field: string; operator: string; value: unknown }[] = [
      { field: "adset.name", operator: "EQUAL", value: options.adsetName },
    ];
    if (campaignNames.length === 1) {
      filters.push({ field: "campaign.name", operator: "EQUAL", value: campaignNames[0] });
    } else if (campaignNames.length > 1) {
      filters.push({ field: "campaign.name", operator: "IN", value: campaignNames });
    }
    filteringParam =
      "&filtering=" + encodeURIComponent(JSON.stringify(filters));
  } else if (campaignNames.length === 1) {
    level = "campaign";
    filteringParam =
      "&filtering=" +
      encodeURIComponent(
        JSON.stringify([{ field: "campaign.name", operator: "EQUAL", value: campaignNames[0] }]),
      );
  }

  for (const accountId of accountIds) {
    const url =
      `${FB_GRAPH_API_V25}/${accountId}/insights` +
      `?fields=reach,clicks,impressions` +
      `&time_range=${timeRange}` +
      `&level=${level}` +
      `&time_increment=all_days` +
      filteringParam +
      `&access_token=${accessToken}`;

    const res: {
      data: {
        data?: { reach?: string; clicks?: string; impressions?: string }[];
      };
    } = await axios.get(url);

    for (const item of res.data.data ?? []) {
      totalReach += parseInt(String(item.reach ?? "0"), 10);
      totalClicks += parseInt(String(item.clicks ?? "0"), 10);
      totalImpressions += parseInt(String(item.impressions ?? "0"), 10);
    }
  }

  return {
    reach: totalReach,
    clicks: totalClicks,
    impressions: totalImpressions,
  };
}

/**
 * Fetch total leads for a list of ad account IDs directly from Facebook Insights API.
 * - time_increment=all_days  → one row per account for the whole period (no daily summing / no overlap)
 * - action_attribution_windows=7d_click,1d_view → matches Ads Manager default attribution
 * - Uses "offsite_conversion.fb_pixel_custom" which matches this account's Ads Manager Results column.
 *   "lead" (Facebook Form) is excluded — it tracks a separate event for this account.
 */
export async function fetchAccountLeads(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
  options?: { campaignNames?: string[]; adsetName?: string },
): Promise<number> {
  let total = 0;
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  const campaignNames = options?.campaignNames ?? [];
  let level = "account";
  let filteringParam = "";
  if (options?.adsetName) {
    level = "adset";
    const filters: { field: string; operator: string; value: unknown }[] = [
      { field: "adset.name", operator: "EQUAL", value: options.adsetName },
    ];
    if (campaignNames.length === 1) {
      filters.push({ field: "campaign.name", operator: "EQUAL", value: campaignNames[0] });
    } else if (campaignNames.length > 1) {
      filters.push({ field: "campaign.name", operator: "IN", value: campaignNames });
    }
    filteringParam =
      "&filtering=" + encodeURIComponent(JSON.stringify(filters));
  } else if (campaignNames.length === 1) {
    level = "campaign";
    filteringParam =
      "&filtering=" +
      encodeURIComponent(
        JSON.stringify([{ field: "campaign.name", operator: "EQUAL", value: campaignNames[0] }]),
      );
  }

  for (const accountId of accountIds) {
    const url =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=actions` +
      `&time_range=${timeRange}` +
      `&level=${level}` +
      `&time_increment=all_days` +
      filteringParam +
      `&access_token=${accessToken}`;

    const res: {
      data: {
        data?: { actions?: { action_type: string; value: string }[] }[];
      };
    } = await axios.get(url);

    for (const item of res.data.data ?? []) {
      let leadTotal = 0;
      let onsiteLeadTotal = 0;
      for (const action of item.actions ?? []) {
        if (action.action_type === "lead") {
          leadTotal += parseFloat(action.value ?? "0") || 0;
        }
        if (action.action_type === "onsite_conversion.lead") {
          onsiteLeadTotal += parseFloat(action.value ?? "0") || 0;
        }
      }
      total += leadTotal - onsiteLeadTotal;
    }
  }
  return Math.round(total);
}

/**
 * Fetch reach broken down by campaign for a list of ad account IDs.
 * Makes one API call per account at level=campaign, returns a Map<campaign_name, {campaign_id, reach}>.
 * Accurate unique reach per campaign (not summed from daily raw rows).
 */
export async function fetchCampaignReach(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
): Promise<
  Map<
    string,
    {
      campaign_id: string;
      account_id: string;
      reach: number;
      clicks: number;
      ctr: number;
    }
  >
> {
  const result = new Map<
    string,
    {
      campaign_id: string;
      account_id: string;
      reach: number;
      clicks: number;
      impressions: number;
    }
  >();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=reach,clicks,impressions,campaign_name,campaign_id` +
      `&time_range=${timeRange}&level=campaign&access_token=${accessToken}`;

    while (url) {
      const res: {
        data: {
          data?: {
            reach?: string;
            clicks?: string;
            impressions?: string;
            campaign_name?: string;
            campaign_id?: string;
          }[];
          paging?: { next?: string };
        };
      } = await axios.get(url);
      for (const item of res.data.data ?? []) {
        const name = item.campaign_name ?? "";
        const id = item.campaign_id ?? "";
        const reach = parseInt(String(item.reach ?? "0"), 10);
        const clicks = parseInt(String(item.clicks ?? "0"), 10);
        const impressions = parseInt(String(item.impressions ?? "0"), 10);
        const existing = result.get(name);
        result.set(name, {
          campaign_id: id || existing?.campaign_id || "",
          account_id: accountId,
          reach: (existing?.reach ?? 0) + reach,
          clicks: (existing?.clicks ?? 0) + clicks,
          impressions: (existing?.impressions ?? 0) + impressions,
        });
      }
      url = res.data.paging?.next ?? null;
    }
  }

  const out = new Map<
    string,
    {
      campaign_id: string;
      account_id: string;
      reach: number;
      clicks: number;
      ctr: number;
    }
  >();
  for (const [name, { impressions, ...entry }] of result.entries()) {
    out.set(name, {
      ...entry,
      ctr:
        impressions > 0
          ? parseFloat(((entry.clicks / impressions) * 100).toFixed(2))
          : 0,
    });
  }
  return out;
}

/**
 * Fetch reach broken down by ad for a list of ad account IDs.
 * Returns a Map<ad_id, { ad_id, ad_name, reach }>.
 */
export async function fetchAdsetInsights(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
): Promise<
  { adset_name: string; clicks_all: number; impressions: number; ctr: number }[]
> {
  const result = new Map<string, { clicks_all: number; impressions: number }>();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=adset_name,clicks,impressions` +
      `&time_range=${timeRange}&level=ad&time_increment=all_days&access_token=${accessToken}`;

    while (url) {
      const res: {
        data: {
          data?: {
            adset_name?: string;
            clicks?: string;
            impressions?: string;
          }[];
          paging?: { next?: string };
        };
      } = await axios.get(url);
      for (const item of res.data.data ?? []) {
        const name = item.adset_name ?? "";
        const clicks = parseInt(String(item.clicks ?? "0"), 10);
        const impressions = parseInt(String(item.impressions ?? "0"), 10);
        const existing = result.get(name) ?? { clicks_all: 0, impressions: 0 };
        result.set(name, {
          clicks_all: existing.clicks_all + clicks,
          impressions: existing.impressions + impressions,
        });
      }
      url = res.data.paging?.next ?? null;
    }
  }

  return Array.from(result.entries()).map(
    ([adset_name, { clicks_all, impressions }]) => ({
      adset_name,
      clicks_all,
      impressions,
      ctr:
        impressions > 0
          ? parseFloat(((clicks_all / impressions) * 100).toFixed(2))
          : 0,
    }),
  );
}

export async function fetchAdReach(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
): Promise<
  {
    ad_id: string;
    ad_name: string;
    reach: number;
    clicks: number;
    impressions: number;
    ctr: number;
  }[]
> {
  const result = new Map<
    string,
    {
      ad_id: string;
      ad_name: string;
      reach: number;
      clicks: number;
      impressions: number;
    }
  >();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=reach,clicks,impressions,ad_id,ad_name` +
      `&time_range=${timeRange}&level=ad&time_increment=all_days&access_token=${accessToken}`;

    while (url) {
      const res: {
        data: {
          data?: {
            reach?: string;
            clicks?: string;
            impressions?: string;
            ad_id?: string;
            ad_name?: string;
          }[];
          paging?: { next?: string };
        };
      } = await axios.get(url);
      for (const item of res.data.data ?? []) {
        const id = item.ad_id ?? "";
        const name = item.ad_name ?? "";
        const reach = parseInt(String(item.reach ?? "0"), 10);
        const clicks = parseInt(String(item.clicks ?? "0"), 10);
        const impressions = parseInt(String(item.impressions ?? "0"), 10);
        const existing = result.get(id);
        result.set(id, {
          ad_id: id,
          ad_name: name,
          reach: (existing?.reach ?? 0) + reach,
          clicks: (existing?.clicks ?? 0) + clicks,
          impressions: (existing?.impressions ?? 0) + impressions,
        });
      }
      url = res.data.paging?.next ?? null;
    }
  }

  return Array.from(result.values())
    .map(({ clicks, impressions, ...entry }) => ({
      ...entry,
      clicks,
      impressions,
      ctr:
        impressions > 0
          ? parseFloat(((clicks / impressions) * 100).toFixed(2))
          : 0,
    }))
    .sort((a, b) => b.reach - a.reach);
}

/**
 * Fetch age/gender breakdown from Facebook Insights API.
 * Returns array of { age, gender, impressions }.
 */
export async function fetchAgeGenderBreakdown(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
): Promise<{ age: string; gender: string; impressions: number }[]> {
  const map = new Map<string, number>();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=impressions` +
      `&breakdowns=age,gender&time_range=${timeRange}&level=account&access_token=${accessToken}&limit=500`;

    while (url) {
      const res: { data: { data?: any[]; paging?: { next?: string } } } =
        await axios.get(url);
      for (const item of res.data.data ?? []) {
        const key = `${item.age}|||${item.gender}`;
        map.set(
          key,
          (map.get(key) ?? 0) + parseInt(String(item.impressions ?? "0"), 10),
        );
      }
      url = res.data.paging?.next ?? null;
    }
  }

  return [...map.entries()].map(([key, impressions]) => {
    const [age, gender] = key.split("|||");
    return { age, gender, impressions };
  });
}

/**
 * Fetch device (impression_device) breakdown from Facebook Insights API.
 * Returns array of { device, impressions }.
 */
export async function fetchDeviceBreakdown(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
): Promise<{ device: string; impressions: number }[]> {
  const map = new Map<string, number>();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=impressions` +
      `&breakdowns=impression_device&time_range=${timeRange}&level=account&access_token=${accessToken}&limit=500`;

    while (url) {
      const res: { data: { data?: any[]; paging?: { next?: string } } } =
        await axios.get(url);
      for (const item of res.data.data ?? []) {
        const device = item.impression_device ?? "unknown";
        map.set(
          device,
          (map.get(device) ?? 0) +
            parseInt(String(item.impressions ?? "0"), 10),
        );
      }
      url = res.data.paging?.next ?? null;
    }
  }

  return [...map.entries()]
    .map(([device, impressions]) => ({ device, impressions }))
    .sort((a, b) => b.impressions - a.impressions);
}

/**
 * Fetch region breakdown with reach data from Facebook Insights API.
 * Returns array of { region, spend, impressions, reach, inline_link_clicks, purchases, purchase_value }.
 */
export async function fetchRegionData(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
): Promise<
  {
    region: string;
    spend: number;
    impressions: number;
    reach: number;
    inline_link_clicks: number;
    purchases: number;
    purchase_value: number;
  }[]
> {
  const map = new Map<
    string,
    {
      spend: number;
      impressions: number;
      reach: number;
      inline_link_clicks: number;
      purchases: number;
      purchase_value: number;
    }
  >();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=spend,impressions,reach,inline_link_clicks,actions,action_values` +
      `&breakdowns=region&time_range=${timeRange}&level=account&access_token=${accessToken}&limit=500`;

    while (url) {
      const res: { data: { data?: any[]; paging?: { next?: string } } } =
        await axios.get(url);
      for (const item of res.data.data ?? []) {
        const region = item.region ?? "Unknown";
        const purchases = (() => {
          if (!Array.isArray(item.actions)) return 0;
          const variants = ["purchase"];
          for (const variant of variants) {
            const action = item.actions.find(
              (a: any) => a.action_type === variant,
            );
            if (action) return parseInt(String(action.value ?? "0"), 10);
          }
          return 0;
        })();
        const purchase_value = (() => {
          const variants = [
            "purchase",
            "offsite_conversion.fb_pixel_purchase",
          ];
          // Try action_values first
          if (Array.isArray(item.action_values)) {
            for (const variant of variants) {
              const action = item.action_values.find(
                (a: any) => a.action_type === variant,
              );
              if (action) return parseFloat(String(action.value ?? "0"));
            }
          }
          // Fallback to conversion_values
          const conversionValues = (item as any).conversion_values;
          if (Array.isArray(conversionValues)) {
            for (const variant of variants) {
              const action = conversionValues.find(
                (a: any) => a.action_type === variant,
              );
              if (action) return parseFloat(String(action.value ?? "0"));
            }
          }
          return 0;
        })();

        const existing = map.get(region) ?? {
          spend: 0,
          impressions: 0,
          reach: 0,
          inline_link_clicks: 0,
          purchases: 0,
          purchase_value: 0,
        };
        map.set(region, {
          spend: existing.spend + parseFloat(String(item.spend ?? "0")),
          impressions:
            existing.impressions +
            parseInt(String(item.impressions ?? "0"), 10),
          reach: existing.reach + parseInt(String(item.reach ?? "0"), 10),
          inline_link_clicks:
            existing.inline_link_clicks +
            parseInt(String(item.inline_link_clicks ?? "0"), 10),
          purchases: existing.purchases + purchases,
          purchase_value: existing.purchase_value + purchase_value,
        });
      }
      url = res.data.paging?.next ?? null;
    }
  }

  return [...map.entries()].map(([region, data]) => ({
    region,
    ...data,
  }));
}

/**
 * Fetch raw spend and purchase_value components from Facebook API.
 * ROAS is calculated downstream as purchase_value / spend.
 *
 * Aggregation level is chosen automatically based on filter:
 *   - adset filter set    → level=adset
 *   - 1+ campaign filters → level=campaign
 *   - no filter           → level=account
 */
export async function fetchAccountPurchaseRoas(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
  options?: { campaignNames?: string[]; adsetName?: string },
): Promise<{ purchase_value: number; purchases: number; spend: number }> {
  const totals = { purchase_value: 0, purchases: 0, spend: 0 };
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  const PURCHASE_VARIANTS = [
    "omni_purchase",
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_web_purchase",
    "web_in_store_purchase",
  ];

  function pick(
    arr: { action_type: string; value: string }[] | undefined,
  ): number {
    if (!Array.isArray(arr)) return 0;
    for (const v of PURCHASE_VARIANTS) {
      const a = arr.find((x) => x.action_type === v);
      if (a) return parseFloat(String(a.value ?? "0"));
    }
    return 0;
  }

  const campaignNames = options?.campaignNames ?? [];
  let level = "account";
  let filteringParam = "";
  if (options?.adsetName) {
    level = "adset";
    const filters: { field: string; operator: string; value: unknown }[] = [
      { field: "adset.name", operator: "EQUAL", value: options.adsetName },
    ];
    if (campaignNames.length === 1) {
      filters.push({
        field: "campaign.name",
        operator: "EQUAL",
        value: campaignNames[0],
      });
    } else if (campaignNames.length > 1) {
      filters.push({
        field: "campaign.name",
        operator: "IN",
        value: campaignNames,
      });
    }
    filteringParam =
      "&filtering=" + encodeURIComponent(JSON.stringify(filters));
  } else if (campaignNames.length === 1) {
    level = "campaign";
    filteringParam =
      "&filtering=" +
      encodeURIComponent(
        JSON.stringify([
          {
            field: "campaign.name",
            operator: "EQUAL",
            value: campaignNames[0],
          },
        ]),
      );
  } else if (campaignNames.length > 1) {
    level = "campaign";
    filteringParam =
      "&filtering=" +
      encodeURIComponent(
        JSON.stringify([
          { field: "campaign.name", operator: "IN", value: campaignNames },
        ]),
      );
  }

  for (const accountId of accountIds) {
    const url =
      `${FB_GRAPH_API_V25}/${accountId}/insights?` +
      `fields=spend,actions,action_values,conversion_values` +
      `&time_range=${timeRange}&level=${level}` +
      `&use_unified_attribution_setting=true` +
      filteringParam +
      `&access_token=${accessToken}`;

    try {
      console.log(`fetchAccountPurchaseRoas url for ${accountId}:`, url.replace(accessToken, "***"));
      const res: {
        data: {
          data?: {
            spend?: string;
            actions?: { action_type: string; value: string }[];
            action_values?: { action_type: string; value: string }[];
            conversion_values?: { action_type: string; value: string }[];
          }[];
        };
      } = await axios.get(url, { timeout: 30000 });

      for (const item of res.data.data ?? []) {
        const spend = parseFloat(String(item.spend ?? "0"));
        totals.spend += spend;

        const purchases = (() => {
          if (!Array.isArray(item.actions)) return 0;
          for (const v of PURCHASE_VARIANTS) {
            const a = item.actions.find((x) => x.action_type === v);
            if (a) return parseInt(String(a.value ?? "0"), 10);
          }
          return 0;
        })();
        totals.purchases += purchases;

        // Get purchase_value (revenue) directly — calculate ROAS later as revenue/spend
        const purchase_value =
          pick(item.action_values) || pick(item.conversion_values);
        totals.purchase_value += purchase_value;
      }
    } catch (e: any) {
      const fbMsg = e?.response?.data?.error?.message ?? e?.response?.data ?? e?.message;
      console.error(`fetchAccountPurchaseRoas error for ${accountId}:`, fbMsg);
    }
  }

  return totals;
}

/**
 * Fetch raw spend & purchase_value components per ad from Facebook API.
 * ROAS is calculated downstream as purchase_value / spend.
 * Returns Map keyed by ad_id with purchase data.
 */
export async function fetchAdPurchases(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
  options?: { campaignNames?: string[]; adsetName?: string },
): Promise<
  Map<
    string,
    {
      ad_id: string;
      ad_name: string;
      purchases: number;
      purchase_value: number;
      spend: number;
    }
  >
> {
  const result = new Map<
    string,
    {
      ad_id: string;
      ad_name: string;
      purchases: number;
      purchase_value: number;
      spend: number;
    }
  >();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  const PURCHASE_VARIANTS = [
    "omni_purchase",
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_web_purchase",
    "web_in_store_purchase",
  ];

  function pick(
    arr: { action_type: string; value: string }[] | undefined,
  ): number {
    if (!Array.isArray(arr)) return 0;
    for (const v of PURCHASE_VARIANTS) {
      const a = arr.find((x) => x.action_type === v);
      if (a) return parseFloat(String(a.value ?? "0"));
    }
    return 0;
  }

  const campaignNames = options?.campaignNames ?? [];
  let filteringParam = "";
  const filters: { field: string; operator: string; value: unknown }[] = [];
  if (options?.adsetName) {
    filters.push({
      field: "adset.name",
      operator: "EQUAL",
      value: options.adsetName,
    });
  }
  if (campaignNames.length === 1) {
    filters.push({
      field: "campaign.name",
      operator: "EQUAL",
      value: campaignNames[0],
    });
  } else if (campaignNames.length > 1) {
    filters.push({
      field: "campaign.name",
      operator: "IN",
      value: campaignNames,
    });
  }
  if (filters.length > 0) {
    filteringParam =
      "&filtering=" + encodeURIComponent(JSON.stringify(filters));
  }

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?` +
      `fields=ad_id,ad_name,spend,actions,action_values,conversion_values` +
      `&time_range=${timeRange}&level=ad&limit=500` +
      `&use_unified_attribution_setting=true` +
      filteringParam +
      `&access_token=${accessToken}`;

    while (url) {
      try {
        const res: {
          data: {
            data?: {
              ad_id?: string;
              ad_name?: string;
              spend?: string;
              actions?: { action_type: string; value: string }[];
              action_values?: { action_type: string; value: string }[];
              conversion_values?: { action_type: string; value: string }[];
            }[];
            paging?: { next?: string };
          };
        } = await axios.get(url, { timeout: 30000 });

        for (const item of res.data.data ?? []) {
          const ad_id = String(item.ad_id ?? "");
          if (!ad_id) continue;
          const spend = parseFloat(String(item.spend ?? "0"));
          const purchases = (() => {
            if (!Array.isArray(item.actions)) return 0;
            for (const v of PURCHASE_VARIANTS) {
              const a = item.actions.find((x) => x.action_type === v);
              if (a) return parseInt(String(a.value ?? "0"), 10);
            }
            return 0;
          })();
          const purchase_value =
            pick(item.action_values) || pick(item.conversion_values);

          const existing = result.get(ad_id) ?? {
            ad_id,
            ad_name: String(item.ad_name ?? ""),
            purchases: 0,
            purchase_value: 0,
            spend: 0,
          };
          result.set(ad_id, {
            ad_id,
            ad_name: existing.ad_name || String(item.ad_name ?? ""),
            purchases: existing.purchases + purchases,
            purchase_value: existing.purchase_value + purchase_value,
            spend: existing.spend + spend,
          });
        }

        url = res.data.paging?.next ?? null;
      } catch (e) {
        console.error(`fetchAdPurchases error for ${accountId}:`, e);
        url = null;
      }
    }
  }

  return result;
}

/**
 * Fetch raw spend & purchase_value components by campaign + adset from Facebook API.
 * ROAS is calculated downstream as purchase_value / spend.
 * Returns Map keyed by "campaign_name|||adset_name".
 */
export async function fetchAdsetPurchases(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
): Promise<
  Map<string, { purchases: number; purchase_value: number; spend: number }>
> {
  const result = new Map<
    string,
    { purchases: number; purchase_value: number; spend: number }
  >();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  const PURCHASE_VARIANTS = [
    "omni_purchase",
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_web_purchase",
    "web_in_store_purchase",
  ];

  function extractByVariant(
    arr: { action_type: string; value: string }[] | undefined,
  ): number {
    if (!Array.isArray(arr)) return 0;
    for (const variant of PURCHASE_VARIANTS) {
      const a = arr.find((x) => x.action_type === variant);
      if (a) return parseFloat(String(a.value ?? "0"));
    }
    return 0;
  }

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?` +
      `fields=campaign_name,adset_name,spend,actions,action_values,conversion_values` +
      `&time_range=${timeRange}&level=adset&limit=500` +
      `&use_unified_attribution_setting=true` +
      `&access_token=${accessToken}`;

    while (url) {
      try {
        const res: {
          data: {
            data?: {
              campaign_name?: string;
              adset_name?: string;
              spend?: string;
              actions?: { action_type: string; value: string }[];
              action_values?: { action_type: string; value: string }[];
              conversion_values?: { action_type: string; value: string }[];
            }[];
            paging?: { next?: string };
          };
        } = await axios.get(url, { timeout: 30000 });

        for (const item of res.data.data ?? []) {
          const key = `${item.campaign_name ?? ""}|||${item.adset_name ?? ""}`;
          const spend = parseFloat(String(item.spend ?? "0"));
          const purchases = (() => {
            if (!Array.isArray(item.actions)) return 0;
            for (const v of PURCHASE_VARIANTS) {
              const a = item.actions.find((x) => x.action_type === v);
              if (a) return parseInt(String(a.value ?? "0"), 10);
            }
            return 0;
          })();

          // Get purchase_value (revenue) directly from action_values
          // ROAS will be calculated downstream as revenue/spend
          const purchase_value =
            extractByVariant(item.action_values) ||
            extractByVariant(item.conversion_values);

          const existing = result.get(key) ?? {
            purchases: 0,
            purchase_value: 0,
            spend: 0,
          };
          result.set(key, {
            purchases: existing.purchases + purchases,
            purchase_value: existing.purchase_value + purchase_value,
            spend: existing.spend + spend,
          });
        }

        url = res.data.paging?.next ?? null;
      } catch (e) {
        console.error(`fetchAdsetPurchases error for ${accountId}:`, e);
        url = null;
      }
    }
  }

  return result;
}
