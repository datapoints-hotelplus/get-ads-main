import { NextResponse } from "next/server";
import axios from "axios";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

type SheetRow = (string | number)[];
type FBAction = { action_type: string; value: string };
type FBItem = { actions?: FBAction[]; action_values?: FBAction[] } & Record<string, unknown>;

// ─── Field lists ──────────────────────────────────────────────────────────────

const BASE_FIELDS = [
  "ad_id", "ad_name", "spend", "reach", "impressions",
  "actions", "action_values", "date_start", "date_stop",
].join(",");

const MASTER_FIELDS = [
  "account_name", "campaign_name", "frequency", ...BASE_FIELDS.split(","),
].join(",");

// ─── Sheet schemas ────────────────────────────────────────────────────────────

const SCHEMA = {
  rawdata: {
    headers: [
      "date_start", "date_stop", "account_name", "campaign_name",
      "ad_id", "ad_name",
      "spend", "frequency", "reach", "impressions",
      "purchases", "purchase_value", "roas", "cost_per_result",
    ],
    breakdown: null as string | null,
    fields: MASTER_FIELDS,
    keyIdx: [0, 4] as number[], // date_start | ad_id
  },
  geo: {
    headers: [
      "date_start", "date_stop", "ad_id", "ad_name",
      "region",
      "spend", "reach", "impressions", "purchases", "purchase_value",
    ],
    breakdown: "region",
    fields: BASE_FIELDS,
    keyIdx: [0, 2, 4] as number[], // date_start | ad_id | region
  },
  demographic: {
    headers: [
      "date_start", "date_stop", "ad_id", "ad_name",
      "age", "gender",
      "spend", "reach", "impressions", "purchases", "purchase_value",
    ],
    breakdown: "age,gender",
    fields: BASE_FIELDS,
    keyIdx: [0, 2, 4, 5] as number[], // date_start | ad_id | age | gender
  },
  device: {
    headers: [
      "date_start", "date_stop", "ad_id", "ad_name",
      "impression_device",
      "spend", "reach", "impressions", "purchases", "purchase_value",
    ],
    breakdown: "impression_device",
    fields: BASE_FIELDS,
    keyIdx: [0, 2, 4] as number[], // date_start | ad_id | impression_device
  },
} as const;

type SheetKey = keyof typeof SCHEMA;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}

function findAction(arr: FBAction[] | undefined, type: string): number {
  return num(arr?.find((a) => a.action_type === type)?.value);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeKey(row: SheetRow, keyIdx: readonly number[]): string {
  return keyIdx.map((i) => String(row[i] ?? "")).join("|");
}

// ─── Item parsers (one per sheet type) ────────────────────────────────────────

function parseToRow(item: FBItem, sheetKey: SheetKey): SheetRow {
  const spend = num(item.spend);
  const purchases = findAction(item.actions, "purchase");
  const purchase_value = findAction(item.action_values, "purchase");
  const roas = spend > 0 ? parseFloat((purchase_value / spend).toFixed(4)) : 0;
  const cost_per_result = purchases > 0 ? parseFloat((spend / purchases).toFixed(4)) : 0;

  const s = (k: string) => String(item[k] ?? "");
  const n2 = (k: string) => parseInt(String(item[k] ?? "0"), 10);

  switch (sheetKey) {
    case "rawdata":
      return [
        s("date_start"), s("date_stop"),
        s("account_name"), s("campaign_name"),
        s("ad_id"), s("ad_name"),
        spend, num(item.frequency), n2("reach"), n2("impressions"),
        purchases, purchase_value, roas, cost_per_result,
      ];
    case "geo":
      return [
        s("date_start"), s("date_stop"),
        s("ad_id"), s("ad_name"),
        s("region"),
        spend, n2("reach"), n2("impressions"), purchases, purchase_value,
      ];
    case "demographic":
      return [
        s("date_start"), s("date_stop"),
        s("ad_id"), s("ad_name"),
        s("age"), s("gender"),
        spend, n2("reach"), n2("impressions"), purchases, purchase_value,
      ];
    case "device":
      return [
        s("date_start"), s("date_stop"),
        s("ad_id"), s("ad_name"),
        s("impression_device"),
        spend, n2("reach"), n2("impressions"), purchases, purchase_value,
      ];
  }
}

// ─── Fetch one stream (all pages) ─────────────────────────────────────────────

async function fetchStream(
  accountId: string,
  accessToken: string,
  datePreset: string,
  sheetKey: SheetKey,
): Promise<SheetRow[]> {
  const { breakdown, fields } = SCHEMA[sheetKey];
  const rows: SheetRow[] = [];
  let nextUrl: string | null = null;
  let firstRequest = true;
  let page = 0;

  while (firstRequest || nextUrl) {
    firstRequest = false;
    page++;

    const res: { data: { data?: FBItem[]; paging?: { next?: string } } } = nextUrl
      ? await axios.get(nextUrl)
      : await axios.get(`${FB_GRAPH_API}/act_${accountId}/insights`, {
          params: {
            level: "ad",
            fields,
            ...(breakdown ? { breakdowns: breakdown } : {}),
            date_preset: datePreset,
            limit: 1000,
            access_token: accessToken,
          },
        });

    const items = (res.data.data ?? []) as FBItem[];
    const parsed = items.map((item) => parseToRow(item, sheetKey));
    rows.push(...parsed);
    nextUrl = (res.data.paging?.next as string) ?? null;

    console.log(`  [${sheetKey}][act_${accountId}] page ${page} — +${items.length} rows (total ${rows.length})${nextUrl ? " →" : " ✓"}`);
  }

  return rows;
}

// ─── Upsert rows into a sheet ─────────────────────────────────────────────────

async function upsertSheet(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  sheetKey: SheetKey,
  newRows: SheetRow[],
): Promise<{ updated: number; appended: number }> {
  const { headers, keyIdx } = SCHEMA[sheetKey];
  const sheetName = sheetKey === "rawdata" ? "rawdata" : "data";

  // Read existing data
  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
  });
  let existingRows = (existingRes.data.values ?? []) as SheetRow[];

  // Reset if header mismatch
  const currentHeader = existingRows[0]?.map(String) ?? [];
  const headerOk =
    currentHeader.length === headers.length &&
    currentHeader.every((h, i) => h === headers[i]);

  if (!headerOk) {
    console.log(`  [${sheetKey}] Header mismatch — resetting sheet`);
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetName}!A:Z` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...headers]] },
    });
    existingRows = [[...headers]];
  }

  // Build key map
  const keyToRow = new Map<string, number>();
  for (let i = 1; i < existingRows.length; i++) {
    const k = makeKey(existingRows[i], keyIdx);
    if (k.replaceAll("|", "") !== "") keyToRow.set(k, i + 1);
  }

  // Classify
  const toUpdate: { sheetRow: number; values: SheetRow }[] = [];
  const toAppend: SheetRow[] = [];

  for (const row of newRows) {
    const k = makeKey(row, keyIdx);
    const existing = keyToRow.get(k);
    if (existing && existing > 0) {
      toUpdate.push({ sheetRow: existing, values: row });
    } else {
      keyToRow.set(k, -(toAppend.length + 1));
      toAppend.push(row);
    }
  }

  // Batch update
  const CHUNK = 1000;
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: chunk.map(({ sheetRow, values }) => ({
          range: `${sheetName}!A${sheetRow}`,
          values: [values],
        })),
      },
    });
  }

  // Append
  if (toAppend.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: toAppend },
    });
  }

  return { updated: toUpdate.length, appended: toAppend.length };
}

// ─── Read account IDs ─────────────────────────────────────────────────────────

async function getAccountIds(
  spreadsheetId: string,
): Promise<{ name: string; id: string }[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "PageIDs!A2:B",
  });
  return (res.data.values ?? [])
    .filter((row) => row[1]?.trim())
    .map((row) => ({ name: String(row[0] ?? ""), id: String(row[1]).trim() }));
}

// ─── Main route ───────────────────────────────────────────────────────────────

function getSpreadsheetId(sheetKey: SheetKey, mainId: string): string {
  switch (sheetKey) {
    case "geo":         return process.env.GEO_SHEET_ID ?? mainId;
    case "demographic": return process.env.DEMO_SHEET_ID ?? mainId;
    case "device":      return process.env.DEVICE_SHEET_ID ?? mainId;
    default:            return mainId;
  }
}

export async function POST(request: Request) {
  const accessToken = process.env.FB_ACCESS_TOKEN;
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  const url = new URL(request.url);
  const datePreset = url.searchParams.get("date_preset") ?? "maximum";

  if (!accessToken || !spreadsheetId) {
    return NextResponse.json(
      { error: "Missing FB_ACCESS_TOKEN or GOOGLE_SHEETS_ID" },
      { status: 400 },
    );
  }

  const accounts = await getAccountIds(spreadsheetId);
  if (accounts.length === 0) {
    return NextResponse.json(
      { error: "ไม่พบ Account ID ใน PageIDs sheet (column B)" },
      { status: 404 },
    );
  }

  console.log(`\n[sync-insights] START — date_preset: ${datePreset}, accounts: ${accounts.length}`);

  const sheets = getSheetsClient();
  const streamKeys: SheetKey[] = ["rawdata", "geo", "demographic", "device"];

  // Collect all rows per sheet across all accounts
  const allRows: Record<SheetKey, SheetRow[]> = {
    rawdata: [], geo: [], demographic: [], device: [],
  };

  const summary: {
    name: string; id: string;
    rows: Record<SheetKey, number>;
    error?: string;
  }[] = [];

  for (const [idx, account] of accounts.entries()) {
    console.log(`\n[sync-insights] [${idx + 1}/${accounts.length}] ${account.name} (act_${account.id})`);

    const rowCounts: Record<SheetKey, number> = { rawdata: 0, geo: 0, demographic: 0, device: 0 };

    try {
      // Fetch all 4 streams in parallel
      const results = await Promise.all(
        streamKeys.map((key) => fetchStream(account.id, accessToken, datePreset, key)),
      );

      for (const [i, key] of streamKeys.entries()) {
        allRows[key].push(...results[i]);
        rowCounts[key] = results[i].length;
      }

      summary.push({ name: account.name, id: account.id, rows: rowCounts });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error(`  [ERROR] ${msg}`);
      summary.push({ name: account.name, id: account.id, rows: rowCounts, error: msg });
    }

    if (idx < accounts.length - 1) {
      console.log("  ...waiting 3s");
      await sleep(3000);
    }
  }

  // Write to all sheets
  console.log("\n[sync-insights] Writing to all sheets...");
  const writeResults: Record<string, { updated: number; appended: number }> = {};

  for (const key of streamKeys) {
    const targetId = getSpreadsheetId(key, spreadsheetId);
    console.log(`  → ${key}: ${allRows[key].length} rows → spreadsheet ${targetId}`);
    writeResults[key] = await upsertSheet(sheets, targetId, key, allRows[key]);
  }

  console.log("[sync-insights] DONE ✓\n");

  return NextResponse.json({
    success: true,
    date_preset: datePreset,
    sheets: writeResults,
    accounts: summary,
  });
}
