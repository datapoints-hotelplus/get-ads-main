import { google } from "googleapis";
import { JWT } from "google-auth-library";

interface SheetData {
  pageId: string;
  pageName: string;
  likes: number;
  followers: number;
  biography: string;
  website: string;
  postsCount: number;
  totalPostLikes: number;
  totalPostComments: number;
  fetchedAt: string;
}

/**
 * Initialize Google Sheets client
 */
function initializeGoogleSheetsClient() {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;

  if (!credentialsJson) {
    throw new Error(
      "GOOGLE_CREDENTIALS_JSON is not set in environment variables",
    );
  }

  try {
    const credentials = JSON.parse(credentialsJson);

    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    return google.sheets({ version: "v4", auth });
  } catch (error: any) {
    throw new Error(`Failed to parse Google credentials: ${error.message}`);
  }
}

/**
 * Create headers in Google Sheet if they don't exist
 */
export async function initializeGoogleSheet(spreadsheetId: string) {
  try {
    const sheets = initializeGoogleSheetsClient();

    const headers = [
      [
        "Page ID",
        "Page Name",
        "Likes",
        "Followers",
        "Biography",
        "Website",
        "Posts Count",
        "Total Likes",
        "Total Comments",
        "Fetched At",
      ],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A1:J1",
      valueInputOption: "RAW",
      requestBody: {
        values: headers,
      },
    });

    console.log("Google Sheet initialized with headers");
  } catch (error: any) {
    console.error("Error initializing Google Sheet:", error.message);
    throw error;
  }
}

/**
 * Insert Facebook page data into Google Sheet
 */
export async function insertFacebookDataToSheet(
  spreadsheetId: string,
  data: SheetData[],
) {
  try {
    const sheets = initializeGoogleSheetsClient();

    const rows = data.map((item) => [
      item.pageId,
      item.pageName,
      item.likes,
      item.followers,
      item.biography,
      item.website,
      item.postsCount,
      item.totalPostLikes,
      item.totalPostComments,
      item.fetchedAt,
    ]);

    // Get current data to append
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:A",
    });

    const lastRow = (response.data.values?.length || 0) + 1;

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `Sheet1!A${lastRow}:J${lastRow + rows.length - 1}`,
      valueInputOption: "RAW",
      requestBody: {
        values: rows,
      },
    });

    console.log(`${rows.length} rows inserted into Google Sheet`);
    return { success: true, rowsInserted: rows.length };
  } catch (error: any) {
    console.error("Error inserting data to Google Sheet:", error.message);
    throw error;
  }
}

/**
 * Convert Facebook data to Sheet format
 */
export function convertToSheetData(facebookData: any[]): SheetData[] {
  return facebookData.map((item) => ({
    pageId: item.page.id,
    pageName: item.page.name,
    likes: item.page.likes,
    followers: item.page.followers,
    biography: item.page.biography,
    website: item.page.website,
    postsCount: item.posts.length,
    totalPostLikes: item.posts.reduce(
      (sum: number, post: any) => sum + post.likes,
      0,
    ),
    totalPostComments: item.posts.reduce(
      (sum: number, post: any) => sum + post.comments,
      0,
    ),
    fetchedAt: item.fetchedAt,
  }));
}

/**
 * Fetch page IDs from Google Sheet
 */
export async function getPageIdsFromSheet(
  spreadsheetId: string,
  sheetName: string = "PageIDs",
): Promise<string[]> {
  try {
    const sheets = initializeGoogleSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!B2:B`, // Start from row 2 to skip header
    });

    const pageIds =
      response.data.values
        ?.flat()
        .filter((id: string) => id && id.trim())
        .map((id: string) => id.trim()) || [];

    if (pageIds.length === 0) {
      throw new Error(`No page IDs found in sheet '${sheetName}'`);
    }

    return pageIds;
  } catch (error: any) {
    console.error("Error fetching page IDs from Google Sheet:", error.message);
    throw error;
  }
}
