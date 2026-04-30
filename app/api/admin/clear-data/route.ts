import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { getSupabase } from "@/lib/supabase";

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

const ALLOWED_TABLES = [
  "ads_rawdata",
  "ads_geo",
  "ads_demographic",
  "ads_device",
] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

// ── DELETE /api/admin/clear-data
// Body: { tables: string[], dateFrom?: string, dateTo?: string }
// dateFrom/dateTo optional — if omitted, deletes ALL rows (2020-01-01 → today)
// Deletes in monthly chunks to avoid statement timeout on unindexed tables

function monthChunks(from: string, to: string): { from: string; to: string }[] {
  const chunks: { from: string; to: string }[] = [];
  const end = new Date(to);
  let cur = new Date(from);
  while (cur <= end) {
    const chunkFrom = cur.toISOString().slice(0, 10);
    const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const chunkTo = (lastDay > end ? end : lastDay).toISOString().slice(0, 10);
    chunks.push({ from: chunkFrom, to: chunkTo });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return chunks;
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { tables, dateFrom, dateTo } = body as {
    tables?: string[];
    dateFrom?: string;
    dateTo?: string;
  };

  if (!Array.isArray(tables) || tables.length === 0) {
    return NextResponse.json(
      { error: "tables array is required" },
      { status: 400 },
    );
  }

  // Validate table names against allowlist
  const invalid = tables.filter(
    (t) => !ALLOWED_TABLES.includes(t as AllowedTable),
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid table names: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const results: Record<string, { deleted: boolean; error?: string }> = {};

  // Determine date range — default covers all historical data
  const today = new Date().toISOString().slice(0, 10);
  const rangeFrom = dateFrom ?? "2020-01-01";
  const rangeTo = dateTo ?? today;
  const chunks = monthChunks(rangeFrom, rangeTo);

  for (const table of tables as AllowedTable[]) {
    try {
      // Delete month-by-month to avoid statement timeout on tables without indexes
      for (const chunk of chunks) {
        const { error } = await supabase
          .from(table)
          .delete()
          .gte("date_start", chunk.from)
          .lte("date_start", chunk.to);
        if (error) throw error;
      }
      results[table] = { deleted: true };
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);
      results[table] = { deleted: false, error: msg };
    }
  }

  return NextResponse.json({ results });
}
