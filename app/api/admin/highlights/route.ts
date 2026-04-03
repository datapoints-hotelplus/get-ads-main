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

// GET — list all highlight configs + campaigns
export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { searchParams } = request.nextUrl;
  const listCampaigns = searchParams.get("list") === "campaigns";

  // Always get highlights
  const { data, error } = await supabase
    .from("ads_campaign_highlights")
    .select("*")
    .order("campaign_name")
    .order("metric_key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grouped: Record<string, string[]> = {};
  for (const row of data ?? []) {
    if (!grouped[row.campaign_name]) grouped[row.campaign_name] = [];
    grouped[row.campaign_name].push(row.metric_key);
  }

  // If requested, also return distinct campaign names
  if (listCampaigns) {
    // Paginate through all rows to get every distinct campaign_name
    const allNames = new Set<string>();
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk } = await supabase
        .from("ads_rawdata")
        .select("campaign_name")
        .not("campaign_name", "is", null)
        .range(from, from + pageSize - 1);
      if (!chunk || chunk.length === 0) break;
      for (const r of chunk) {
        if (r.campaign_name) allNames.add(r.campaign_name as string);
      }
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
    const campaigns = [...allNames].sort();
    return NextResponse.json({ highlights: grouped, campaigns });
  }

  return NextResponse.json({ highlights: grouped });
}

// PUT — save highlights for a campaign (replace all)
export async function PUT(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { campaign_name, metrics } = body as { campaign_name: string; metrics: string[] };

  if (!campaign_name || !Array.isArray(metrics)) {
    return NextResponse.json({ error: "campaign_name and metrics[] required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Delete existing
  await supabase
    .from("ads_campaign_highlights")
    .delete()
    .eq("campaign_name", campaign_name);

  // Insert new
  if (metrics.length > 0) {
    const rows = metrics.map((m) => ({ campaign_name, metric_key: m }));
    const { error } = await supabase.from("ads_campaign_highlights").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
