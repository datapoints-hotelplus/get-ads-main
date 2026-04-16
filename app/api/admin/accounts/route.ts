import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { getSupabase } from "@/lib/supabase";
import axios from "axios";

async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

export async function GET() {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ads_allpage")
    .select("account_name, account_id, is_active")
    .order("account_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  let { account_name, account_id } = body as {
    account_name?: string;
    account_id?: string;
  };

  if (!account_name || !account_id) {
    return NextResponse.json(
      { error: "account_name and account_id are required" },
      { status: 400 },
    );
  }

  account_name = account_name.trim();
  account_id = account_id.trim();
  if (!account_id.startsWith("act_")) {
    account_id = `act_${account_id}`;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("ads_allpage")
    .insert({ account_name, account_id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    .from("ads_allpage")
    .delete()
    .eq("account_id", account_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { account_id, is_active } = body as {
    account_id?: string;
    is_active?: boolean;
  };

  if (!account_id || typeof is_active !== "boolean") {
    return NextResponse.json(
      { error: "account_id and is_active are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("ads_allpage")
    .update({ is_active })
    .eq("account_id", account_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// PUT /api/admin/accounts — fetch from Facebook and upsert into Supabase
export async function PUT() {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "FB_ACCESS_TOKEN is not configured" },
      { status: 400 },
    );
  }

  // Fetch ad accounts from Facebook
  let fbAccounts: { name: string; account_id: string }[] = [];
  try {
    const fbRes = await axios.get(
      "https://graph.facebook.com/v25.0/me/adaccounts",
      {
        params: {
          fields: "name,account_id",
          limit: 100,
          access_token: accessToken,
        },
      },
    );
    fbAccounts = fbRes.data.data ?? [];
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to fetch from Facebook";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (fbAccounts.length === 0) {
    return NextResponse.json(
      { error: "ไม่พบ Ad Account ที่เชื่อมกับ token นี้" },
      { status: 404 },
    );
  }

  // Upsert into Supabase (update account_name if account_id already exists)
  const rows = fbAccounts.map((a) => ({
    account_name: a.name,
    account_id: a.account_id.startsWith("act_")
      ? a.account_id
      : `act_${a.account_id}`,
  }));

  const supabase = getSupabase();
  const { error } = await supabase
    .from("ads_allpage")
    .upsert(rows, { onConflict: "account_id", ignoreDuplicates: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    fetched: rows.length,
    accounts: rows,
  });
}
