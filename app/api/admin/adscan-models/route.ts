import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Model = { id: string; name: string; context: number | null; inPerM: number | null; outPerM: number | null };

// ponytail: per-process, 1h — the list changes a few times a week; no store needed.
let cache: { at: number; models: Model[] } | null = null;

// The families the team picks from: GPT, Claude, Llama (Meta), Qwen.
const PROVIDERS = ["openai/", "anthropic/", "meta-llama/", "qwen/"];

/** GET /api/admin/adscan-models — OpenRouter text models from those families, for the Model select. Admin only (proxy). */
export async function GET() {
  if (cache && Date.now() - cache.at < 3600_000) return NextResponse.json({ models: cache.models });
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    const j = (await res.json()) as { data?: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { output_modalities?: string[] } }[] };
    const perM = (v?: string) => (v !== undefined && !isNaN(Number(v)) ? Math.round(Number(v) * 1e6 * 100) / 100 : null);
    const models = (j.data ?? [])
      .filter((m) => PROVIDERS.some((p) => m.id.startsWith(p)))
      .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes("text"))
      .map((m): Model => ({ id: m.id, name: m.name ?? m.id, context: m.context_length ?? null, inPerM: perM(m.pricing?.prompt), outPerM: perM(m.pricing?.completion) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    cache = { at: Date.now(), models };
    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, models: cache?.models ?? [] }, { status: cache ? 200 : 502 });
  }
}
