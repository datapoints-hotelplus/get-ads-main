import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { verifyPassword } from "@/lib/userAuth";
import { signSessionToken, verifySessionToken } from "@/lib/sessionToken";

const COOKIE_NAME = "session";
const COOKIE_MAX_AGE = 7 * 86_400; // 7 days

// ── POST /api/user/auth — Login (both admin and user) ─────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body as { username?: string; password?: string };

  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: user, error } = await supabase
    .from("ads_users")
    .select("id, username, password_hash, is_active, display_name, role")
    .eq("username", username.trim().toLowerCase())
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (!user.is_active) {
    return NextResponse.json({ error: "Account is disabled." }, { status: 403 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const role = (user.role as "admin" | "user") ?? "user";
  const token = await signSessionToken(user.id, role);

  // Log login
  const headerStore = await headers();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "";
  const ua = headerStore.get("user-agent") ?? "";

  await supabase.from("ads_user_access_logs").insert({
    user_id: user.id,
    username: user.username,
    page: "login",
    ip_address: ip,
    user_agent: ua,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role,
    },
  });
}

// ── DELETE /api/user/auth — Logout ────────────────────────────────────────────
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  // Also clear legacy cookies
  cookieStore.delete("user_session");
  cookieStore.delete("admin_session");
  return NextResponse.json({ success: true });
}

// ── GET /api/user/auth — Get current user info ────────────────────────────────
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: user, error } = await supabase
    .from("ads_users")
    .select("id, username, display_name, is_active, role")
    .eq("id", session.userId)
    .single();

  if (error || !user || !user.is_active) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role ?? "user",
    },
  });
}
