import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { getSupabase } from "@/lib/supabase";

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
