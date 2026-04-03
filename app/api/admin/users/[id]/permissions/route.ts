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

type Params = { params: Promise<{ id: string }> };

// ── GET /api/admin/users/[id]/permissions ─────────────────────────────────────
// Returns the list of account_ids the user can see, plus all available accounts.
export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await params;
  const supabase = getSupabase();

  const [permRes, allRes] = await Promise.all([
    supabase
      .from("ads_user_page_permissions")
      .select("account_id")
      .eq("user_id", userId),
    supabase
      .from("ads_allpage")
      .select("account_id, account_name")
      .order("account_name"),
  ]);

  if (permRes.error)
    return NextResponse.json({ error: permRes.error.message }, { status: 500 });
  if (allRes.error)
    return NextResponse.json({ error: allRes.error.message }, { status: 500 });

  const granted = (permRes.data ?? []).map((r) => r.account_id as string);
  const allAccounts = allRes.data ?? [];

  return NextResponse.json({ granted, allAccounts });
}

// ── POST /api/admin/users/[id]/permissions — Grant access to an account ───────
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await params;
  const body = await req.json().catch(() => ({}));
  const { account_id } = body as { account_id?: string };

  if (!account_id) {
    return NextResponse.json(
      { error: "account_id is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("ads_user_page_permissions")
    .upsert({ user_id: userId, account_id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

// ── DELETE /api/admin/users/[id]/permissions — Revoke access ─────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await params;
  const body = await req.json().catch(() => ({}));
  const { account_id } = body as { account_id?: string };

  if (!account_id) {
    return NextResponse.json(
      { error: "account_id is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("ads_user_page_permissions")
    .delete()
    .eq("user_id", userId)
    .eq("account_id", account_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ── PUT /api/admin/users/[id]/permissions — Bulk replace all permissions ──────
export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await params;
  const body = await req.json().catch(() => ({}));
  const { account_ids } = body as { account_ids?: string[] };

  if (!Array.isArray(account_ids)) {
    return NextResponse.json(
      { error: "account_ids array is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabase();

  // Delete all existing permissions for this user
  const { error: delError } = await supabase
    .from("ads_user_page_permissions")
    .delete()
    .eq("user_id", userId);

  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  // Insert the new set (if any)
  if (account_ids.length > 0) {
    const rows = account_ids.map((aid) => ({
      user_id: userId,
      account_id: aid,
    }));
    const { error: insError } = await supabase
      .from("ads_user_page_permissions")
      .insert(rows);

    if (insError) {
      return NextResponse.json({ error: insError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, count: account_ids.length });
}
