import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { getSupabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/userAuth";
import { ROLES, type Role } from "@/lib/access";

/** Rejected, not coerced — a typo must not silently become a real role. */
function isRole(v: unknown): v is Role {
  return (ROLES as readonly string[]).includes(v as string);
}

async function adminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  return session?.role === "admin" ? session : null;
}

async function checkAdminAuth(): Promise<boolean> {
  return (await adminSession()) !== null;
}

// ── GET /api/admin/users — List all users ─────────────────────────────────────
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ads_users")
    .select("id, username, display_name, is_active, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}

// ── POST /api/admin/users — Create a user ────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { username, password, display_name, role } = body as {
    username?: string;
    password?: string;
    display_name?: string;
    role?: string;
  };

  if (role !== undefined && !isRole(role)) {
    return NextResponse.json({ error: `role must be one of: ${ROLES.join(", ")}` }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json(
      { error: "username and password are required" },
      { status: 400 },
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 },
    );
  }

  const normalised = username.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ads_users")
    .insert({
      username: normalised,
      password_hash: passwordHash,
      display_name: display_name?.trim() || null,
      role: role ?? "user",
    })
    .select("id, username, display_name, is_active, role, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Username "${normalised}" already exists` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data }, { status: 201 });
}

// ── PATCH /api/admin/users — Update user (reset password / toggle active) ────
export async function PATCH(req: NextRequest) {
  const session = await adminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, password, is_active, display_name, role } = body as {
    id?: string;
    password?: string;
    is_active?: boolean;
    display_name?: string;
    role?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Build update payload — only include provided fields
  const updates: Record<string, unknown> = {};

  if (password !== undefined) {
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }
    updates.password_hash = await hashPassword(password);
  }

  if (is_active !== undefined) {
    updates.is_active = Boolean(is_active);
  }

  if (display_name !== undefined) {
    updates.display_name = display_name.trim() || null;
  }

  if (role !== undefined) {
    if (!isRole(role)) {
      return NextResponse.json({ error: `role must be one of: ${ROLES.join(", ")}` }, { status: 400 });
    }
    // An admin demoting themselves is one click from locking every admin out.
    if (id === session.userId && role !== "admin") {
      return NextResponse.json({ error: "เปลี่ยน role ของตัวเองไม่ได้ — ให้ admin คนอื่นเปลี่ยนให้" }, { status: 400 });
    }
    updates.role = role;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ads_users")
    .update(updates)
    .eq("id", id)
    .select("id, username, display_name, is_active, role")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

// ── DELETE /api/admin/users — Delete a user ───────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("ads_users").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
