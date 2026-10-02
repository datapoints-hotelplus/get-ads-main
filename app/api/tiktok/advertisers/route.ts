/**
 * app/api/tiktok/advertisers/route.ts
 * F06: manage which connected TikTok ad accounts are actively synced.
 *
 * GET   -> list all known advertisers (id, name, is_active)
 * PATCH -> { advertiser_id, is_active } toggle one account on/off
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAuthorizedSyncCaller } from "@/lib/syncAuth";

export async function GET() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("tiktok_advertisers")
    .select("advertiser_id, advertiser_name, is_active")
    .order("advertiser_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ advertisers: data ?? [] });
}

export async function PATCH(req: Request) {
  if (!(await isAuthorizedSyncCaller(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { advertiser_id, is_active } = body as { advertiser_id?: string; is_active?: boolean };
  if (!advertiser_id || typeof is_active !== "boolean") {
    return NextResponse.json({ error: "advertiser_id and is_active are required" }, { status: 400 });
  }

  const sb = getSupabase();
  const { error } = await sb.from("tiktok_advertisers").update({ is_active }).eq("advertiser_id", advertiser_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
