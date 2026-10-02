/**
 * app/api/tiktok/alert-settings/route.ts
 * Admin-configurable alert email recipients (F04/F26/F27) — see
 * supabase/migrations/033_tiktok_alert_settings.sql and lib/email.ts.
 * GET returns the current list. PUT replaces it (admin only).
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAuthorizedSyncCaller } from "@/lib/syncAuth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const sb = getSupabase();
  const { data } = await sb.from("tiktok_alert_settings").select("recipients").eq("id", 1).maybeSingle();
  return NextResponse.json({ recipients: data?.recipients ?? [] });
}

export async function PUT(req: Request) {
  if (!(await isAuthorizedSyncCaller(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const recipients = (body as { recipients?: unknown }).recipients;

  if (!Array.isArray(recipients) || recipients.length === 0 || !recipients.every((r) => typeof r === "string" && EMAIL_RE.test(r))) {
    return NextResponse.json({ error: "ต้องเป็นรายการอีเมลที่ถูกต้องอย่างน้อย 1 รายการ" }, { status: 400 });
  }

  const sb = getSupabase();
  const { error } = await sb.from("tiktok_alert_settings").upsert(
    { id: 1, recipients, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
