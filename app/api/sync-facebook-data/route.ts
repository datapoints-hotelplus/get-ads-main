import { NextRequest, NextResponse } from "next/server";
import { getAllFacebookPagesData } from "@/lib/facebook";
import {
  initializeGoogleSheet,
  insertFacebookDataToSheet,
  convertToSheetData,
  getPageIdsFromSheet,
} from "@/lib/googleSheets";

export async function POST(request: NextRequest) {
  try {
    // Validate environment variables
    const fbAccessToken = process.env.FB_ACCESS_TOKEN;
    const googleSheetsId = process.env.GOOGLE_SHEETS_ID;

    if (!fbAccessToken || !googleSheetsId) {
      return NextResponse.json(
        {
          error: "Missing required environment variables",
          details: {
            hasFbToken: !!fbAccessToken,
            hasSheetId: !!googleSheetsId,
          },
        },
        { status: 400 },
      );
    }

    // Fetch page IDs from Google Sheet
    let pageIds: string[] = [];
    try {
      pageIds = await getPageIdsFromSheet(googleSheetsId, "PageIDs");
    } catch (error: any) {
      return NextResponse.json(
        {
          error: "Failed to fetch page IDs from Google Sheet",
          details: error.message,
          hint: "Make sure you have a 'PageIDs' sheet with page IDs in column A (starting from row 2)",
        },
        { status: 400 },
      );
    }

    console.log(`Starting Facebook data sync for ${pageIds.length} page(s)`);

    // Fetch Facebook data
    const facebookData = await getAllFacebookPagesData(pageIds, fbAccessToken);

    if (facebookData.length === 0) {
      return NextResponse.json(
        {
          error: "No Facebook data retrieved. Please check your configuration.",
        },
        { status: 400 },
      );
    }

    // Initialize Google Sheet headers on first run
    try {
      await initializeGoogleSheet(googleSheetsId);
    } catch (error) {
      console.log("Sheet already initialized or error during initialization");
    }

    // Convert data to sheet format
    const sheetData = convertToSheetData(facebookData);

    // Insert data into Google Sheet
    const result = await insertFacebookDataToSheet(googleSheetsId, sheetData);

    return NextResponse.json({
      success: true,
      message: "Facebook data successfully synced to Google Sheet",
      data: {
        pagesProcessed: facebookData.length,
        rowsInserted: result.rowsInserted,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error in sync-facebook-data:", error);

    return NextResponse.json(
      {
        error: "Failed to sync Facebook data",
        details: error.message,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "This endpoint syncs Facebook page data to Google Sheets",
    usage: "Send a POST request to /api/sync-facebook-data",
    requirements: [
      "FB_ACCESS_TOKEN environment variable",
      "FB_PAGE_IDS environment variable (comma-separated)",
      "GOOGLE_SHEETS_ID environment variable",
      "GOOGLE_CREDENTIALS_JSON environment variable",
    ],
  });
}
