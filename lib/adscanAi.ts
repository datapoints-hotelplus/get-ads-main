/**
 * lib/adscanAi.ts
 * ADSCAN AI Skill — the recommendation on the Detail View (TOR ส่วนที่ 2).
 * The prompt + model live in adscan_skills (versioned masterdata, edited at
 * /admin/adscan-skill); the API key stays in the environment: OPENROUTER_API_KEY (OpenRouter).
 */
import { getSupabase } from "@/lib/supabase";
import { WINDOW, type Node, type Verdict } from "@/lib/adscan";

export type Skill = { version: number; model: string; prompt: string; note: string | null; is_active: boolean; created_at: string; created_by: string | null };

export async function activeSkill(): Promise<Skill | null> {
  const { data, error } = await getSupabase().from("adscan_skills").select("*").eq("is_active", true)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(/adscan_skills/.test(error.message) ? "ยังไม่ได้สร้างตาราง AI Skill — ต้องรัน migration 042" : error.message);
  return data as Skill | null;
}

/** What the model sees: the alert's real numbers only, compact. */
export function alertInput(v: Verdict) {
  const r = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
  const n = (k: Node) => ({ name: k.name, spend: r(k.spend), share_pct: k.share, results: k.res, cost_per_result: r(k.cpr), cpm: r(k.cpm), ctr_pct: r(k.ctr) });
  return {
    hotel: v.hotel, campaign: v.campaign, verdict: v.sev, kpi: v.template, metric: v.metric, result: v.resLabel,
    threshold: { normal_max: v.green, warning_max: v.yellow },
    window: { from: v.windowFrom, to: v.windowTo, days: WINDOW, spend: r(v.spend), results: v.res, value: r(v.value), vs_threshold_pct: v.deltaPct },
    prior_normal_range: v.band?.map(r) ?? null,
    daily_30d: v.dates.map((d, i) => [d, r(v.trend[i])]),
    ad_sets: v.tree.sets.map((s) => ({ ...n(s), ads: s.ads.map(n) })),
    rule_engine_hint: { action: v.action, why: v.why, effect: v.effect },
  };
}

export async function generate(model: string, prompt: string, input: unknown): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้ง OPENROUTER_API_KEY ใน .env");
  // OpenRouter model ids are "provider/model". Skills saved before the switch
  // hold a bare Gemini id ("gemini-2.5-flash") — treat that as Google's.
  const id = model.includes("/") ? model : `google/${model}`;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: id,
      temperature: 0.3,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${j?.error?.message ?? res.statusText}`);
  const text = String(j?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("AI ไม่ได้ส่งคำตอบกลับมา");
  return text;
}

/** Newest stored recommendation for a campaign — what users read. Never calls the AI. */
export async function stored(campaignId: string) {
  const sb = getSupabase();
  const { data: hit } = await sb.from("adscan_ai_cache").select("text,created_at,skill_version")
    .eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!hit) return null;
  const { data: sk } = await sb.from("adscan_skills").select("model").eq("version", hit.skill_version).maybeSingle();
  return { text: hit.text as string, version: hit.skill_version as number, model: (sk?.model as string) ?? "—", at: hit.created_at as string };
}

/** Daily job: one AI call per campaign × data date × skill version; already-stored ones are skipped. */
export async function generateFor(v: Verdict, dataDate: string) {
  const skill = await activeSkill();
  if (!skill) throw new Error("ยังไม่มี AI Skill — เพิ่มที่ ตั้งค่า › AI Skill (ADSCAN)");
  const sb = getSupabase();
  const { data: hit } = await sb.from("adscan_ai_cache").select("campaign_id")
    .eq("campaign_id", v.id).eq("data_date", dataDate).eq("skill_version", skill.version).maybeSingle();
  if (hit) return false;
  const text = await generate(skill.model, skill.prompt, alertInput(v));
  await sb.from("adscan_ai_cache").upsert({ campaign_id: v.id, data_date: dataDate, skill_version: skill.version, text, created_at: new Date().toISOString() });
  return true;
}
