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
  Map<string, { campaign_id: string; account_id: string; reach: number }>
> {
  const result = new Map<
    string,
    { campaign_id: string; account_id: string; reach: number }
  >();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=reach,campaign_name,campaign_id` +
      `&time_range=${timeRange}&level=campaign&access_token=${accessToken}`;

    while (url) {
      const res: {
        data: {
          data?: {
            reach?: string;
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
        const existing = result.get(name);
        result.set(name, {
          campaign_id: id || existing?.campaign_id || "",
          account_id: accountId,
          reach: (existing?.reach ?? 0) + reach,
        });
      }
      url = res.data.paging?.next ?? null;
    }
  }

  return result;
}

/**
 * Fetch reach broken down by ad for a list of ad account IDs.
 * Returns a Map<ad_id, { ad_id, ad_name, reach }>.
 */
export async function fetchAdReach(
  accountIds: string[],
  accessToken: string,
  since: string,
  until: string,
): Promise<{ ad_id: string; ad_name: string; reach: number }[]> {
  const result = new Map<
    string,
    { ad_id: string; ad_name: string; reach: number }
  >();
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  for (const accountId of accountIds) {
    let url: string | null =
      `${FB_GRAPH_API_V25}/${accountId}/insights?fields=reach,ad_id,ad_name` +
      `&time_range=${timeRange}&level=ad&access_token=${accessToken}`;

    while (url) {
      const res: {
        data: {
          data?: { reach?: string; ad_id?: string; ad_name?: string }[];
          paging?: { next?: string };
        };
      } = await axios.get(url);
      for (const item of res.data.data ?? []) {
        const id = item.ad_id ?? "";
        const name = item.ad_name ?? "";
        const reach = parseInt(String(item.reach ?? "0"), 10);
        const existing = result.get(id);
        result.set(id, {
          ad_id: id,
          ad_name: name,
          reach: (existing?.reach ?? 0) + reach,
        });
      }
      url = res.data.paging?.next ?? null;
    }
  }

  return Array.from(result.values()).sort((a, b) => b.reach - a.reach);
}
