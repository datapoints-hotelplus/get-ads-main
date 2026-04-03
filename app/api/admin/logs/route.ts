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

// ── GET /api/admin/logs?limit=100&user_id=<uuid> ──────────────────────────────
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const filterUserId = searchParams.get("user_id") ?? "";

  const supabase = getSupabase();
  let query = supabase
    .from("ads_user_access_logs")
    .select("id, user_id, username, page, ip_address, user_agent, accessed_at")
    .order("accessed_at", { ascending: false })
    .limit(limit);

  if (filterUserId) {
    query = query.eq("user_id", filterUserId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] });
}
