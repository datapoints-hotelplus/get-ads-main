import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { getSupabase } from "@/lib/supabase";
import { verifySessionToken } from "@/lib/sessionToken";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

async function checkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return session?.role === "admin";
}

function maskToken(t: string): string {
  if (!t || t.length <= 12) return "****";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

// POST /api/admin/refresh-token
// Body: { token: "<short-lived or long-lived token>" }
// Exchange token → long-lived (60 days) → save to DB
export async function POST(req: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const inputToken = String(body.token ?? "").trim();
  if (!inputToken) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "FB_APP_ID หรือ FB_APP_SECRET ไม่ได้ตั้งค่าใน env" },
      { status: 500 },
    );
  }

  try {
    // Exchange input token → long-lived token
    const res = await axios.get(`${FB_GRAPH_API}/oauth/access_token`, {
      params: {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: inputToken,
      },
      timeout: 15_000,
    });

    const newToken = res.data.access_token as string | undefined;
    const expiresIn = res.data.expires_in as number | undefined;

    if (!newToken) {
      return NextResponse.json(
        { error: "Facebook ไม่ return access_token" },
        { status: 500 },
      );
    }

    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // Save to DB
    const supabase = getSupabase();
    const { error: dbErr } = await supabase.from("fb_token_store").upsert(
      {
        id: 1,
        access_token: newToken,
        expires_at: expiresAt,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      masked: maskToken(newToken),
      expires_in: expiresIn,
      expires_at: expiresAt,
    });
  } catch (e: any) {
    const fbMsg =
      e?.response?.data?.error?.message ?? e?.message ?? "Unknown error";
    return NextResponse.json({ error: fbMsg }, { status: 500 });
  }
}
