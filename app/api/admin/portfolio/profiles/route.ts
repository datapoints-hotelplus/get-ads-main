import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { getSupabase } from "@/lib/supabase";

async function checkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

// GET — list all profiles with their accounts
export async function GET() {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data: profiles, error } = await supabase
    .from("ads_portfolio_profiles")
    .select("id, name, created_at, ads_portfolio_profile_accounts(account_id)")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // also fetch all accounts for the selector
  const { data: accounts } = await supabase
    .from("ads_allpage")
    .select("account_id, account_name")
    .eq("is_active", true)
    .order("account_name");

  return NextResponse.json({ profiles, accounts: accounts ?? [] });
}

// POST — create profile with accounts
export async function POST(req: Request) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { name, account_ids } = body;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const supabase = getSupabase();
  const { data: profile, error } = await supabase
    .from("ads_portfolio_profiles")
    .insert({ name })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(account_ids) && account_ids.length > 0) {
    const rows = account_ids.map((account_id: string) => ({ profile_id: profile.id, account_id }));
    const { error: linkErr } = await supabase.from("ads_portfolio_profile_accounts").insert(rows);
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ profile });
}

// PATCH — update profile name and/or accounts
export async function PATCH(req: Request) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id, name, account_ids } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabase();

  if (name) {
    const { error } = await supabase.from("ads_portfolio_profiles").update({ name }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(account_ids)) {
    await supabase.from("ads_portfolio_profile_accounts").delete().eq("profile_id", id);
    if (account_ids.length > 0) {
      const rows = account_ids.map((account_id: string) => ({ profile_id: id, account_id }));
      const { error } = await supabase.from("ads_portfolio_profile_accounts").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE — delete profile (cascade deletes accounts)
export async function DELETE(req: Request) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabase();
  const { error } = await supabase.from("ads_portfolio_profiles").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
