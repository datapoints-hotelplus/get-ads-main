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

// GET — list all templates
export async function GET() {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ads_portfolio_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

// PUT — reorder: body { ids: string[] } in the desired order
// ponytail: one update per row, not atomic; fine for a handful of templates
export async function PUT(req: Request) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: unknown = body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === "string")) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  const supabase = getSupabase();
  const results = await Promise.all(
    (ids as string[]).map((id, i) =>
      supabase.from("ads_portfolio_templates").update({ sort_order: i + 1 }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// POST — create template
export async function POST(req: Request) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { name, metric, direction, target, green_min, yellow_min, green_op, yellow_op, campaign_filter } = body;
  if (!name || !metric) return NextResponse.json({ error: "name and metric required" }, { status: 400 });
  const supabase = getSupabase();
  // append to the end of the manual order
  const { data: last } = await supabase
    .from("ads_portfolio_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("ads_portfolio_templates")
    .insert({ name, metric, direction: direction ?? "higher_better", target, green_min, yellow_min, green_op: green_op ?? ">=", yellow_op: yellow_op ?? ">=", campaign_filter: campaign_filter ?? null, sort_order: (last?.sort_order ?? 0) + 1 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

// PATCH — update template
export async function PATCH(req: Request) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ads_portfolio_templates")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

// DELETE — delete template
export async function DELETE(req: Request) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabase();
  const { error } = await supabase.from("ads_portfolio_templates").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
