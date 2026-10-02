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
// Returns the list of account_ids the user can see, plus all available accounts
// — for both Facebook (ads_allpage) and TikTok (tiktok_advertisers).
export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await params;
  const supabase = getSupabase();

  const [permRes, allRes, tiktokPermRes, allTiktokRes] = await Promise.all([
    supabase
      .from("ads_user_page_permissions")
      .select("account_id")
      .eq("user_id", userId),
    supabase
      .from("ads_allpage")
      .select("account_id, account_name")
      .order("account_name"),
    supabase
      .from("tiktok_user_advertiser_permissions")
      .select("advertiser_id")
      .eq("user_id", userId),
    supabase
      .from("tiktok_advertisers")
      .select("advertiser_id, advertiser_name")
      .order("advertiser_name"),
  ]);

  if (permRes.error)
    return NextResponse.json({ error: permRes.error.message }, { status: 500 });
  if (allRes.error)
    return NextResponse.json({ error: allRes.error.message }, { status: 500 });
  if (tiktokPermRes.error)
    return NextResponse.json({ error: tiktokPermRes.error.message }, { status: 500 });
  if (allTiktokRes.error)
    return NextResponse.json({ error: allTiktokRes.error.message }, { status: 500 });

  const granted = (permRes.data ?? []).map((r) => r.account_id as string);
  const allAccounts = allRes.data ?? [];
  const tiktokGranted = (tiktokPermRes.data ?? []).map((r) => r.advertiser_id as string);
  const allTiktokAdvertisers = allTiktokRes.data ?? [];

  return NextResponse.json({ granted, allAccounts, tiktokGranted, allTiktokAdvertisers });
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
// Facebook (account_ids) and TikTok (tiktok_advertiser_ids) are independent —
// only the key(s) actually sent get replaced, so the Facebook list survives
// a TikTok-only save and vice versa.
export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await params;
  const body = await req.json().catch(() => ({}));
  const { account_ids, tiktok_advertiser_ids } = body as {
    account_ids?: string[];
    tiktok_advertiser_ids?: string[];
  };

  if (account_ids === undefined && tiktok_advertiser_ids === undefined) {
    return NextResponse.json(
      { error: "account_ids and/or tiktok_advertiser_ids array is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabase();

  async function replace(table: string, column: string, ids: string[] | undefined) {
    if (ids === undefined) return null;
    if (!Array.isArray(ids)) return "must be an array";
    const { error: delError } = await supabase.from(table).delete().eq("user_id", userId);
    if (delError) return delError.message;
    if (ids.length > 0) {
      const rows = ids.map((id) => ({ user_id: userId, [column]: id }));
      const { error: insError } = await supabase.from(table).insert(rows);
      if (insError) return insError.message;
    }
    return null;
  }

  const [fbErr, tiktokErr] = await Promise.all([
    replace("ads_user_page_permissions", "account_id", account_ids),
    replace("tiktok_user_advertiser_permissions", "advertiser_id", tiktok_advertiser_ids),
  ]);
  if (fbErr) return NextResponse.json({ error: fbErr }, { status: 500 });
  if (tiktokErr) return NextResponse.json({ error: tiktokErr }, { status: 500 });

  return NextResponse.json({
    success: true,
    count: account_ids?.length ?? undefined,
    tiktok_count: tiktok_advertiser_ids?.length ?? undefined,
  });
}
