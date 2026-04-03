import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * POST /api/user/log
 *
 * Records a dashboard page visit.
 * Called client-side from protected pages on mount.
 * The userId is injected by the middleware as "x-user-id".
 */
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const page: string = (body as { page?: string }).page ?? "unknown";

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "";
  const ua = req.headers.get("user-agent") ?? "";

  const supabase = getSupabase();

  // Get username for denormalised log column
  const { data: user } = await supabase
    .from("ads_users")
    .select("username")
    .eq("id", userId)
    .single();

  await supabase.from("ads_user_access_logs").insert({
    user_id: userId,
    username: user?.username ?? "unknown",
    page,
    ip_address: ip,
    user_agent: ua,
  });

  return NextResponse.json({ success: true });
}
