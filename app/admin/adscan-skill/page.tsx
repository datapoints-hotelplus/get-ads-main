"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [firstRun, setFirstRun] = useState<{ generated: number; skipped: number; failed: { id: string; error: string }[] } | null>(null);

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

  const active = skills?.find((s) => s.is_active);
  const changed = !!active && (active.model !== model || active.prompt !== prompt);

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader subtitle="AI Skill (ADSCAN)" />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">AI Skill — คำแนะนำในหน้ารายละเอียด Alert</h1>
          <div className="text-sm text-gray-500">
            แก้ prompt และ model ได้ที่นี่ บันทึกแต่ละครั้งเป็นเวอร์ชันใหม่ เวอร์ชันเก่าเก็บไว้ทั้งหมด · API key อยู่ใน <code>.env</code> (GEMINI_API_KEY)
          </div>
        </div>
        {!hasKey && <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">ยังไม่ได้ตั้ง <code>GEMINI_API_KEY</code> ใน .env — ทดสอบและแสดงคำแนะนำไม่ได้จนกว่าจะตั้ง</div>}
        {msg && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{msg}</div>}

        <div className="flex flex-wrap gap-4 items-start">
          <div className={`${card} flex-[3_1_520px] min-w-0 p-5 space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">แก้ไข {active ? `(ใช้อยู่: v${active.version})` : ""}</h2>
              {changed && <span className="text-xs text-amber-700 font-semibold">มีการแก้ที่ยังไม่บันทึก</span>}
            </div>
            <label className="block text-sm">
              <span className="text-gray-600">Model</span>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gemini-2.5-flash" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm" />
            </label>
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
          <h2 className="font-semibold">เรียก AI ครั้งแรก</h2>
          <p className="text-sm text-gray-500">
            ให้ AI วิเคราะห์ทุก alert ที่เป็น &quot;issue&quot; ตอนนี้เลย โดยไม่ต้องรอรอบ 09:00 ของ n8n (เรียก <code>/api/adscan/ai-run</code>) ผลจะถูกเก็บไว้ให้ผู้ใช้เปิดอ่านได้ทันที
            ตัวที่เคยวิเคราะห์ไปแล้วของวันข้อมูลเดียวกันและเวอร์ชัน skill เดียวกันจะถูกข้ามและไม่เสียโควตา · ใช้เวลานานได้เป็นนาทีตามจำนวน alert
          </p>
          <button
            disabled={!!busy || !hasKey || !active}
            onClick={() => {
              if (!window.confirm("เรียก AI วิเคราะห์ทุก alert ที่ยังไม่มีคำแนะนำตอนนี้เลยใช่ไหม? (ใช้โควตา Gemini ต่อ 1 alert)")) return;
              run("firstrun", async () => {
                setFirstRun(null);
                const r = await fetch("/api/adscan/ai-run", { method: "POST" });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.error || "เรียก AI ไม่สำเร็จ");
                setFirstRun({ generated: j.generated ?? 0, skipped: j.skipped ?? 0, failed: j.failed ?? [] });
              });
            }}
            className="px-4 min-h-11 rounded-lg bg-secondary text-white font-semibold disabled:opacity-40"
          >
            {busy === "firstrun" ? "AI กำลังวิเคราะห์… (อย่าปิดหน้านี้)" : "เรียก AI ครั้งแรก"}
          </button>
          {!active && <div className="text-xs text-amber-700">ยังไม่มี skill ที่ใช้อยู่ — บันทึกเวอร์ชันก่อน</div>}
          {firstRun && (
            <div className={`rounded-lg px-3 py-2 text-sm border ${firstRun.failed.length ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-200 text-green-800"}`}>
              สร้างใหม่ {firstRun.generated} · ข้าม (มีอยู่แล้ว) {firstRun.skipped}
              {firstRun.failed.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {firstRun.failed.map((x) => <li key={x.id}><span className="font-mono text-xs">{x.id}</span>: {x.error}</li>)}
                </ul>
              )}
            </div>
          )}
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
