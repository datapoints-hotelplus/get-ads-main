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

// ── GET /api/admin/logs?limit=100&offset=0&user_id=<uuid>&page=<prefix>&q=<username> ──
// page: prefix of the logged page/action, e.g. "adscan_slack" = every Slack button.
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "100") || 100, 1), 500);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0") || 0, 0);
  const filterUserId = searchParams.get("user_id") ?? "";
  const pagePrefix = searchParams.get("page") ?? "";
  const q = searchParams.get("q")?.trim() ?? "";
  const like = (v: string) => v.replace(/[%_\\]/g, (c) => "\\" + c); // escape LIKE wildcards in user input

  const supabase = getSupabase();
  let query = supabase
    .from("ads_user_access_logs")
    .select("id, user_id, username, page, ip_address, user_agent, accessed_at", { count: "exact" })
    .order("accessed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filterUserId) query = query.eq("user_id", filterUserId);
  if (pagePrefix) query = query.like("page", like(pagePrefix) + "%");
  if (q) query = query.ilike("username", "%" + like(q) + "%");

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
}
