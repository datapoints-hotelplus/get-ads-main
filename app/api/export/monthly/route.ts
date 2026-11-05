import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { GET as dashboard } from "../../dashboard/route";

/**
 * Read-only export for the Marcom Webapp (WBS), server to server:
 *   Authorization: Bearer <EXPORT_SECRET>   (its own secret: it cannot trigger syncs like SYNC_TRIGGER_SECRET can)
 *
 *   GET /api/export/monthly?type=accounts                     → [{ account_id, account_name, is_active }]
 *   GET /api/export/monthly?account=act_123&month=2026-09     → one ad account × one calendar month
 *
 * The month is computed by the dashboard route itself (type=data, admin scope), so every number — reach from the
 * Facebook API, % changes against the previous period of the same length — is exactly what the Facebook dashboard shows.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.EXPORT_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const supabase = getSupabase();

  if (sp.get("type") === "accounts") {
    const { data, error } = await supabase.from("ads_allpage").select("account_id, account_name, is_active").order("account_name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ accounts: data ?? [] });
  }

  const accountId = sp.get("account") ?? "";
  const month = sp.get("month") ?? "";
  if (!/^(act_)?\d{1,30}$/.test(accountId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "account (act_123…) and month (YYYY-MM) are required" }, { status: 400 });
  }
  const id = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const { data: page, error } = await supabase.from("ads_allpage").select("account_id, account_name").in("account_id", [id, id.slice(4)]).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!page) return NextResponse.json({ error: `ไม่พบบัญชีโฆษณา ${id} ใน GETADS` }, { status: 404 });

  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const url = new URL("/api/dashboard", req.nextUrl.origin);
  for (const [k, v] of Object.entries({ type: "data", dateFrom: from, dateTo: to, account: page.account_name })) url.searchParams.set(k, v);
  const res = await dashboard(new NextRequest(url, { headers: { "x-user-role": "admin" } }));
  const body = await res.json();
  if (!res.ok || !body.totals) return NextResponse.json({ error: body.error ?? "dashboard returned no totals" }, { status: res.ok ? 502 : res.status });

  const rows = (body.rows ?? []) as { campaign_name?: string }[];
  return NextResponse.json({
    account_id: page.account_id,
    account_name: page.account_name,
    period: { from, to },
    prevPeriod: body.prevPeriod,
    campaign_count: new Set(rows.map((r) => r.campaign_name)).size,
    rows: body.count ?? 0,
    totals: body.totals,
    changes: body.changes,
  });
}
