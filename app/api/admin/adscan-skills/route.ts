import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { loadAdscan } from "@/lib/adscanData";
import { alertInput, generate } from "@/lib/adscanAi";

export const dynamic = "force-dynamic";

/** GET /api/admin/adscan-skills — every version, newest first (= change history). Admin only (proxy.ts). */
export async function GET() {
  const sb = getSupabase();
  const { data, error } = await sb.from("adscan_skills").select("*").order("version", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = [...new Set((data ?? []).map((s) => s.created_by).filter(Boolean))];
  const { data: users } = ids.length ? await sb.from("ads_users").select("id,username,display_name").in("id", ids) : { data: [] };
  const name = new Map((users ?? []).map((u) => [u.id, u.display_name || u.username]));
  return NextResponse.json({ skills: (data ?? []).map((s) => ({ ...s, by: s.created_by ? name.get(s.created_by) ?? "—" : "ระบบ" })), hasKey: !!process.env.OPENROUTER_API_KEY });
}

/**
 * POST { action: "save", model, prompt, note }        → new active version
 * POST { action: "activate", version }                → switch back to an older version
 * POST { action: "preview", model, prompt, campaign_id } → run on a real alert without saving
 */
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id")!;
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const sb = getSupabase();
  try {
    if (body.action === "preview") {
      if (!body.prompt?.trim() || !body.model?.trim()) return NextResponse.json({ error: "ต้องมี model และ prompt" }, { status: 400 });
      const data = await loadAdscan(userId, "admin");
      const alert = data.alerts.find((a) => a.id === body.campaign_id);
      if (!alert) return NextResponse.json({ error: "ไม่พบ alert นี้" }, { status: 404 });
      return NextResponse.json({ text: await generate(body.model.trim(), body.prompt, alertInput(alert)) });
    }
    if (body.action === "save") {
      if (!body.prompt?.trim() || !body.model?.trim()) return NextResponse.json({ error: "ต้องมี model และ prompt" }, { status: 400 });
      const { error: offErr } = await sb.from("adscan_skills").update({ is_active: false }).eq("is_active", true);
      if (offErr) throw new Error(offErr.message);
      const { data, error } = await sb.from("adscan_skills")
        .insert({ model: body.model.trim(), prompt: body.prompt, note: body.note?.trim() || null, created_by: userId }).select("version").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, version: data.version });
    }
    if (body.action === "activate") {
      const version = Number(body.version);
      const { data: exists } = await sb.from("adscan_skills").select("version").eq("version", version).maybeSingle();
      if (!exists) return NextResponse.json({ error: "ไม่พบเวอร์ชันนี้" }, { status: 404 });
      await sb.from("adscan_skills").update({ is_active: false }).eq("is_active", true);
      const { error } = await sb.from("adscan_skills").update({ is_active: true }).eq("version", version);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
