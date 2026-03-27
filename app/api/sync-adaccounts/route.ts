import { NextResponse } from "next/server";
import axios from "axios";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

function getSheetsClient() {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!credentialsJson) throw new Error("GOOGLE_CREDENTIALS_JSON is not set");

  const credentials = JSON.parse(credentialsJson);
  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export async function POST() {
  const accessToken = process.env.FB_ACCESS_TOKEN;
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!accessToken || !spreadsheetId) {
    return NextResponse.json(
      { error: "Missing FB_ACCESS_TOKEN or GOOGLE_SHEETS_ID" },
      { status: 400 },
    );
  }

  // 1. Fetch ad accounts from Facebook
  const fbRes = await axios.get(`${FB_GRAPH_API}/me/adaccounts`, {
    params: {
      fields: "name,account_id",
      limit: 100,
      access_token: accessToken,
    },
  });

  const accounts: { name: string; account_id: string }[] =
    fbRes.data.data ?? [];

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: "ไม่พบ Ad Account ที่เชื่อมกับ token นี้" },
      { status: 404 },
    );
  }

  // 2. Write to Google Sheets "pageid" sheet
  const sheets = getSheetsClient();
  const sheetName = "PageIDs";

  // Clear existing content first
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A:B`,
  });

  // Write header + data
  const rows = [
    ["Account Name", "Account ID"],
    ...accounts.map((a) => [a.name, a.account_id]),
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  return NextResponse.json({
    success: true,
    count: accounts.length,
    accounts: accounts.map((a) => ({ name: a.name, account_id: a.account_id })),
  });
}
