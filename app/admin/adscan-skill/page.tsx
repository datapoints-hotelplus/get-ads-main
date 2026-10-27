"use client";

import { useCallback, useEffect, useState } from "react";
import ReactSelect from "react-select";
import AppHeader from "@/app/components/AppHeader";
import type { AdscanPayload } from "@/lib/adscanData";

type SkillRow = { version: number; model: string; prompt: string; note: string | null; is_active: boolean; created_at: string; by: string };
const card = "bg-white border border-gray-200 rounded-xl shadow-sm";
const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/** TOR ส่วนที่ 6: edit the AI Skill without touching code; every save is a new version (history). */
export default function AdscanSkillAdmin() {
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [note, setNote] = useState("");
  const [alerts, setAlerts] = useState<{ id: string; label: string }[]>([]);
  const [alertId, setAlertId] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [openV, setOpenV] = useState<number | null>(null);
  const [models, setModels] = useState<{ id: string; name: string; context: number | null; inPerM: number | null; outPerM: number | null }[]>([]);
  const [slack, setSlack] = useState<{ enabled: boolean; hasUrl: boolean; urlMasked: string | null } | null>(null);
  const [slackUrl, setSlackUrl] = useState("");
  const [slackMsg, setSlackMsg] = useState("");
  async function slackCall(body: object) {
    const r = await fetch("/api/admin/adscan-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "ไม่สำเร็จ");
    return j;
  }

  const load = useCallback(
    () =>
      fetch("/api/admin/adscan-skills")
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "โหลดไม่ได้");
          setSkills(j.skills);
          setHasKey(j.hasKey);
          const active = (j.skills as SkillRow[]).find((s) => s.is_active);
          if (active) {
            setModel(active.model);
            setPrompt(active.prompt);
          }
        })
        .catch((e: Error) => setMsg(e.message)),
    [],
  );

  useEffect(() => {
    load();
    fetch("/api/admin/adscan-settings")
      .then((r) => r.json())
      .then((d) => setSlack(d))
      .catch(() => {});
    fetch("/api/admin/adscan-models")
      .then((r) => r.json())
      .then((d) => setModels(d.models ?? []))
      .catch(() => {});
    fetch("/api/adscan")
      .then((r) => r.json())
      .then((d: AdscanPayload) => {
        const list = (d.alerts ?? []).filter((a) => a.kind === "issue" || a.kind === "good")
          .map((a) => ({ id: a.id, label: `[${a.sev === "good" ? "ข่าวดี" : a.sev === "critical" ? "เร่งด่วน" : "ปานกลาง"}] ${a.hotel} — ${a.campaign}` }));
        setAlerts(list);
        if (list[0]) setAlertId(list[0].id);
      })
      .catch(() => {});
  }, [load]);

  async function post(body: object) {
    const r = await fetch("/api/admin/adscan-skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "ไม่สำเร็จ");
    return j;
  }
  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy("");
  }

  type ModelOption = { value: string; label: string; price: string; provider: string };
  const modelOptions: ModelOption[] = models.map((m) => ({
    value: m.id,
    label: m.name,
    price: m.inPerM !== null && m.outPerM !== null ? `$${m.inPerM} / $${m.outPerM} ต่อ 1M` : "",
    provider: m.id.split("/")[0],
  }));
  const PROVIDER_LABEL: Record<string, string> = { openai: "OpenAI (GPT)", anthropic: "Anthropic (Claude)", "meta-llama": "Meta (Llama)", qwen: "Qwen" };
  const modelGroups = Object.entries(PROVIDER_LABEL)
    .map(([p, label]) => ({ label, options: modelOptions.filter((o) => o.provider === p) }))
    .filter((g) => g.options.length);

  const active = skills?.find((s) => s.is_active);
  const changed = !!active && (active.model !== model || active.prompt !== prompt);

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader subtitle="AI Skill (ADSCAN)" />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">AI Skill — คำแนะนำในหน้ารายละเอียด Alert</h1>
          <div className="text-sm text-gray-500">
            แก้ prompt และ model ได้ที่นี่ บันทึกแต่ละครั้งเป็นเวอร์ชันใหม่ เวอร์ชันเก่าเก็บไว้ทั้งหมด · API key อยู่ใน <code>.env</code> (OPENROUTER_API_KEY)
          </div>
        </div>
        {!hasKey && <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">ยังไม่ได้ตั้ง <code>OPENROUTER_API_KEY</code> ใน .env — ทดสอบและแสดงคำแนะนำไม่ได้จนกว่าจะตั้ง</div>}
        {msg && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{msg}</div>}

        <div className="flex flex-wrap gap-4 items-start">
          <div className={`${card} flex-[3_1_520px] min-w-0 p-5 space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">แก้ไข {active ? `(ใช้อยู่: v${active.version})` : ""}</h2>
              {changed && <span className="text-xs text-amber-700 font-semibold">มีการแก้ที่ยังไม่บันทึก</span>}
            </div>
            <div className="block text-sm">
              <span className="text-gray-600">
                Model (OpenRouter){" "}
                <span className="text-xs text-gray-400">{models.length ? `· ${models.length} โมเดล (GPT · Claude · Llama · Qwen) พิมพ์เพื่อค้นหาได้` : "· กำลังโหลดรายการโมเดล…"}</span>
              </span>
              <div className="mt-1">
                <ReactSelect
                  instanceId="adscan-model"
                  isLoading={!models.length}
                  options={modelGroups}
                  value={modelOptions.find((o) => o.value === model) ?? (model ? { value: model, label: model, price: "", provider: "" } : null)}
                  onChange={(o) => o && setModel(o.value)}
                  formatOptionLabel={(o) => (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate">{o.label} <span className="font-mono text-xs text-gray-400">{o.value}</span></span>
                      {o.price && <span className="shrink-0 text-xs text-gray-500">{o.price}</span>}
                    </div>
                  )}
                  placeholder="เลือกโมเดล…"
                  noOptionsMessage={() => "ไม่พบโมเดล"}
                  classNamePrefix="rs"
                  className="text-sm"
                />
              </div>
            </div>
            <label className="block text-sm">
              <span className="text-gray-600">Prompt (คำสั่งระบบ — ข้อมูล alert จะส่งตามไปเป็น JSON)</span>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={16} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">หมายเหตุการเปลี่ยนแปลง</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ให้ตอบสั้นลง" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-wrap gap-2 justify-end">
              <button disabled={!changed || !!busy} onClick={() => run("save", async () => {
                const j = await post({ action: "save", model, prompt, note });
                setNote("");
                setMsg("");
                await load();
                setPreview(`บันทึกเป็น v${j.version} และเริ่มใช้แล้ว`);
              })} className="px-4 min-h-11 rounded-lg bg-secondary text-white font-semibold disabled:opacity-40">
                {busy === "save" ? "กำลังบันทึก…" : "บันทึกเป็นเวอร์ชันใหม่"}
              </button>
            </div>
          </div>

          <div className={`${card} flex-[2_1_360px] min-w-0 p-5 space-y-3`}>
            <h2 className="font-semibold">ทดสอบกับ Alert จริง (ไม่บันทึก)</h2>
            <select value={alertId} onChange={(e) => setAlertId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {alerts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              {!alerts.length && <option value="">ไม่มี alert ให้ทดสอบ</option>}
            </select>
            <button disabled={!alertId || !!busy || !hasKey} onClick={() => run("preview", async () => {
              setPreview("");
              const j = await post({ action: "preview", model, prompt, campaign_id: alertId });
              setPreview(j.text);
            })} className="w-full min-h-11 rounded-lg border border-secondary text-secondary font-semibold disabled:opacity-40">
              {busy === "preview" ? "กำลังให้ AI วิเคราะห์…" : "ลองรันด้วย prompt ที่แก้อยู่"}
            </button>
            {preview && <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap">{preview}</div>}
          </div>
        </div>

        <div className={`${card} p-5 space-y-3`}>
          <h2 className="font-semibold">แจ้งเตือน Slack</h2>
          <p className="text-sm text-gray-500">
            เมื่อ sync ข้อมูลวันใหม่เข้ามาและระบบตรวจ alert เสร็จ (<code>/api/adscan/scan</code> ที่ n8n เรียก หรือมีคนเปิดหน้า ADSCAN) ระบบจะส่งสรุปจำนวน alert เข้า channel ที่ผูกกับ Webhook นี้
            ส่งครั้งเดียวต่อวันข้อมูล · คำแนะนำ AI ไม่ได้รันรายวันแล้ว จะวิเคราะห์ตอนมีคนเปิดดู alert นั้น · สร้างที่ Slack: <em>api.slack.com/apps → Incoming Webhooks → Add New Webhook to Workspace → เลือก channel</em> แล้วคัดลอก URL มาวางที่นี่
          </p>
          {slackMsg && <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">{slackMsg}</div>}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="password"
              autoComplete="off"
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
              placeholder={slack?.hasUrl ? `บันทึกไว้แล้ว: ${slack.urlMasked} (วาง URL ใหม่เพื่อเปลี่ยน)` : "https://hooks.slack.com/services/…"}
              className="flex-1 min-w-[260px] border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
            <button
              disabled={!!busy || !slackUrl.trim()}
              onClick={() => run("slacksave", async () => {
                setSlackMsg("");
                setSlack(await slackCall({ url: slackUrl.trim() }));
                setSlackUrl("");
                setSlackMsg("บันทึก Webhook URL แล้ว");
              })}
              className="px-4 min-h-11 rounded-lg bg-secondary text-white font-semibold disabled:opacity-40"
            >
              {busy === "slacksave" ? "กำลังบันทึก…" : "บันทึก URL"}
            </button>
            <button
              disabled={!!busy || !slack?.hasUrl}
              onClick={() => run("slacktest", async () => {
                setSlackMsg("");
                await slackCall({ action: "test" });
                setSlackMsg("ส่งข้อความทดสอบแล้ว — ตรวจใน channel ว่าเห็นข้อความ");
              })}
              className="px-4 min-h-11 rounded-lg border border-secondary text-secondary font-semibold disabled:opacity-40"
            >
              {busy === "slacktest" ? "กำลังส่ง…" : "ส่งข้อความทดสอบ"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!slack?.enabled}
              disabled={!!busy || !slack?.hasUrl}
              onChange={(e) => run("slacktoggle", async () => setSlack(await slackCall({ enabled: e.target.checked })))}
            />
            เปิดการแจ้งเตือน Slack {!slack?.hasUrl && <span className="text-xs text-gray-400">(บันทึก URL ก่อน)</span>}
          </label>
        </div>

        <div className={`${card} p-5 space-y-2`}>
          <h2 className="font-semibold">ประวัติเวอร์ชัน</h2>
          {skills?.map((s) => (
            <div key={s.version} className="border-b border-gray-100 py-2.5">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <strong className="font-mono">v{s.version}</strong>
                {s.is_active && <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-800 border border-green-200 text-xs font-semibold">ใช้อยู่</span>}
                <span className="font-mono text-xs text-gray-600">{s.model}</span>
                <span className="text-gray-500 text-xs">{when(s.created_at)} · {s.by}</span>
                <span className="text-sm flex-1">{s.note ?? ""}</span>
                <button onClick={() => setOpenV(openV === s.version ? null : s.version)} className="text-xs font-semibold text-secondary">{openV === s.version ? "ซ่อน prompt" : "ดู prompt"}</button>
                {!s.is_active && (
                  <button disabled={!!busy} onClick={() => run("act", async () => { await post({ action: "activate", version: s.version }); await load(); })}
                    className="text-xs font-semibold px-2.5 py-1 rounded border border-gray-300">ใช้เวอร์ชันนี้</button>
                )}
              </div>
              {openV === s.version && <pre className="mt-2 bg-gray-50 rounded p-3 text-xs whitespace-pre-wrap">{s.prompt}</pre>}
            </div>
          ))}
          {skills && !skills.length && <div className="text-sm text-gray-500">ยังไม่มี — รัน migration 042 เพื่อสร้างเวอร์ชันเริ่มต้น</div>}
        </div>
      </div>
    </div>
  );
}
