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

/**
 * Fetch all page data for multiple pages
 */
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
