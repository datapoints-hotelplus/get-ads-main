import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { verifyPassword } from "@/lib/userAuth";
import { signSessionToken, verifySessionToken } from "@/lib/sessionToken";

const COOKIE_NAME = "session";
const COOKIE_MAX_AGE = 86_400; // 1 day

// ── POST /api/admin/auth — Admin Login ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body as { username?: string; password?: string };

  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: user, error } = await supabase
    .from("ads_users")
    .select("id, username, password_hash, is_active, role")
    .eq("username", username.trim().toLowerCase())
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (!user.is_active) {
    return NextResponse.json({ error: "Account is disabled." }, { status: 403 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Not an admin account" }, { status: 403 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signSessionToken(user.id, "admin");

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ success: true });
}

// ── DELETE /api/admin/auth — Logout ───────────────────────────────────────────
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete("admin_session");
  cookieStore.delete("user_session");
  return NextResponse.json({ success: true });
}
