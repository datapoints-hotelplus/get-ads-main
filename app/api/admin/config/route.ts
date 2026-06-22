import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { getSupabase } from "@/lib/supabase";
import { refreshFacebookToken } from "@/lib/facebook-token";

async function checkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

// GET /api/admin/config — return current system status
export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  // FB token status (from fb_token_store)
  let token: {
    refreshed_at: string | null;
    expires_at: string | null;
    masked: string | null;
    source: "db" | "env" | "none";
  } = {
    refreshed_at: null,
    expires_at: null,
    masked: null,
    source: "none",
  };

  try {
    const { data } = await supabase
      .from("fb_token_store")
      .select("access_token, expires_at, refreshed_at")
      .eq("id", 1)
      .single();
    if (data?.access_token) {
      token = {
        refreshed_at: data.refreshed_at as string | null,
        expires_at: data.expires_at as string | null,
        masked: maskToken(data.access_token as string),
        source: "db",
      };
    }
  } catch {
    // Table missing or query failed
  }

  if (token.source === "none" && process.env.FB_ACCESS_TOKEN) {
    token = {
      refreshed_at: null,
      expires_at: null,
      masked: maskToken(process.env.FB_ACCESS_TOKEN),
      source: "env",
    };
  }

  // Latest date in ads_rawdata
  const { data: latestRow } = await supabase
    .from("ads_rawdata")
    .select("date_start")
    .order("date_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: totalRows } = await supabase
    .from("ads_rawdata")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    token,
    ads_rawdata: {
      latest_date: latestRow?.date_start ?? null,
      total_rows: totalRows ?? 0,
    },
  });
}

// POST /api/admin/config — manual refresh of FB token
export async function POST() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { access_token, expires_in } = await refreshFacebookToken();
    return NextResponse.json({
      success: true,
      masked: maskToken(access_token),
      expires_in,
      expires_at: expires_in
        ? new Date(Date.now() + expires_in * 1000).toISOString()
        : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT /api/admin/config — save token directly
export async function PUT(req: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("fb_token_store").upsert(
    {
      id: 1,
      access_token: token,
      refreshed_at: new Date().toISOString(),
      expires_at: null,
    },
    { onConflict: "id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, masked: maskToken(token) });
}

function maskToken(t: string): string {
  if (!t) return "";
  if (t.length <= 12) return "****";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}
