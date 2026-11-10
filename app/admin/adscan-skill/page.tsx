"use client";

import { useCallback, useEffect, useState } from "react";
import ReactSelect from "react-select";
import AppHeader from "@/app/components/AppHeader";
import type { AdscanPayload } from "@/lib/adscanData";

type SkillRow = { version: number; model: string; prompt: string; note: string | null; is_active: boolean; created_at: string; by: string };
const card = "bg-white border border-gray-200 rounded-xl shadow-sm";
const LABEL_FIELDS: { k: string; label: string; hint?: string }[] = [
  { k: "title", label: "บรรทัดหัวเรื่อง", hint: "{date} = วันที่ของข้อมูล" },
  { k: "fresh", label: "หัวข้อ: พบปัญหาใหม่" },
  { k: "pending", label: "หัวข้อ: ยังไม่ได้แก้" },
  { k: "fixed", label: "หัวข้อ: กลับมาปกติแล้ว" },
  { k: "stopped", label: "หัวข้อ: หยุดติดตาม" },
  { k: "noOwner", label: "ชื่อกลุ่มเมื่อไม่มีผู้ดูแล" },
  { k: "hotelHeading", label: "หัวโรงแรม (ใช้กับจัดกลุ่ม ผู้ดูแล › โรงแรม)", hint: "{n} = เลขลำดับ · {hotel} = ชื่อโรงแรม · ใส่ *…* เพื่อทำตัวหนา" },
  { k: "hotelGroup", label: "หัวโรงแรม (ใช้กับจัดกลุ่ม โรงแรม)", hint: "{n} = เลขลำดับ · {hotel} = ชื่อโรงแรม · ใส่ *…* เพื่อทำตัวหนา" },
  { k: "empty", label: "ข้อความเมื่อไม่มีเรื่องต้องดูแล" },
  { k: "footer", label: "ข้อความท้าย", hint: "{link} = ลิงก์ไปหน้า ADSCAN" },
];
const SORT_OPTIONS = [
  { v: "severity_age", label: "เร่งด่วนก่อน แล้วค้างนานสุด" },
  { v: "age", label: "ค้างนานสุดก่อน" },
  { v: "newest", label: "เพิ่งพบก่อน" },
  { v: "hotel", label: "ชื่อโรงแรม ก-ฮ" },
];
const GROUP_OPTIONS = [
  { v: "owner", label: "ผู้ดูแล (Specialist)" },
  { v: "owner_hotel", label: "ผู้ดูแล › โรงแรม (มีเลขลำดับโรงแรม)" },
  { v: "hotel", label: "โรงแรม" },
  { v: "none", label: "ไม่จัดกลุ่ม (รายการเดียวต่อเนื่อง)" },
];
const LINE_VARS = [
  { v: "{hotel}", note: "ชื่อโรงแรม", ex: "Sea U Pattaya H+" },
  { v: "{campaign}", note: "ชื่อแคมเปญ (ต้องมีเสมอ)", ex: "ENG VDO | Sea u pattaya" },
  { v: "{metric}", note: "ชนิดต้นทุน (ไม่มีในหมวด “หยุดติดตาม”)", ex: "ต้นทุนต่อ Engagement" },
  { v: "{status}", note: "สถานะ", ex: "สูงเกินเกณฑ์" },
  { v: "{severity}", note: "ระดับ (ไม่มีในหมวด “กลับมาปกติแล้ว” และ “หยุดติดตาม”)", ex: "ควรดู" },
  { v: "{days}", note: "จำนวนวันที่ค้าง (มีเฉพาะหมวด “ยังไม่ได้แก้”)", ex: "ค้างมา 4 วัน" },
];
const LINE_EXAMPLES: { v: string; out: string; note: string; group?: string }[] = [
  { v: "{hotel} — {campaign} ({metric} {status}, {severity}, {days})", out: "Sea U Pattaya H+ — ENG VDO | Sea u pattaya (ต้นทุนต่อ Engagement สูงเกินเกณฑ์, ควรดู, ค้างมา 4 วัน)", note: "แบบเริ่มต้น" },
  { v: "{campaign} ({metric} {status}, {severity}, {days})", out: "ENG VDO | Sea u pattaya (ต้นทุนต่อ Engagement สูงเกินเกณฑ์, ควรดู, ค้างมา 4 วัน)", note: "ไม่ใส่ชื่อโรงแรมในบรรทัด ใช้คู่กับจัดกลุ่ม “ผู้ดูแล › โรงแรม” (ปุ่มจะตั้งการจัดกลุ่มให้ด้วย)", group: "owner_hotel" },
  { v: "{campaign} @ {hotel} · {severity} · {days}", out: "ENG VDO | Sea u pattaya @ Sea U Pattaya H+ · ควรดู · ค้างมา 4 วัน", note: "ชื่อแคมเปญนำหน้า" },
  { v: "[{severity}] {hotel} — {campaign} {days}", out: "[ควรดู] Sea U Pattaya H+ — ENG VDO | Sea u pattaya ค้างมา 4 วัน", note: "ระดับอยู่หน้าสุด" },
];
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
  const [slack, setSlack] = useState<{ enabled: boolean; hasUrl: boolean; urlMasked: string | null; labels?: Record<string, string>; labelDefaults?: Record<string, string> } | null>(null);
  const [slackUrl, setSlackUrl] = useState("");
  const [slackMsg, setSlackMsg] = useState("");
  const [labelsForm, setLabelsForm] = useState<Record<string, string>>({});
  const [labelsPreview, setLabelsPreview] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHelpOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);
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
      .then((d) => {
        setSlack(d);
        setLabelsForm(d.labels ?? {});
      })
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
            เมื่อ sync ข้อมูลวันใหม่เข้ามาและระบบตรวจ alert เสร็จ ตอน n8n เรียก <code>/api/adscan/scan</code> ระบบจะส่งสรุปเข้า channel ที่ผูกกับ Webhook นี้
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

          <div className="border-t border-gray-100 pt-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm">ข้อความที่ส่งเข้า Slack</h3>
                <p className="text-xs text-gray-500">
                  แก้หัวข้อ รูปแบบบรรทัด การเรียง และการจัดกลุ่มได้ รายชื่อแคมเปญและตัวเลขสร้างจากข้อมูลจริงทุกวัน · ช่องที่เว้นว่างจะใช้ข้อความเริ่มต้น
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                aria-label="วิธีใช้ส่วนข้อความ Slack"
                title="วิธีใช้"
                className="shrink-0 w-10 h-10 rounded-full border border-secondary text-secondary font-serif italic font-bold text-lg hover:bg-gray-50"
              >
                i
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {LABEL_FIELDS.map((f) => (
                <label key={f.k} className={`block text-sm ${f.k === "title" || f.k === "footer" ? "sm:col-span-2" : ""}`}>
                  <span className="text-gray-600">{f.label}{f.hint && <span className="text-xs text-gray-400"> · {f.hint}</span>}</span>
                  <input
                    value={labelsForm[f.k] ?? ""}
                    maxLength={200}
                    onChange={(e) => setLabelsForm({ ...labelsForm, [f.k]: e.target.value })}
                    placeholder={slack?.labelDefaults?.[f.k]}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <label className="block text-sm">
                <span className="text-gray-600">รูปแบบบรรทัดของแต่ละแคมเปญ <span className="text-xs text-gray-400">· สลับตำแหน่งหรือลบตัวแปรได้ ต้องมี {"{campaign}"}</span></span>
                <input
                  value={labelsForm.line ?? ""}
                  maxLength={200}
                  onChange={(e) => setLabelsForm({ ...labelsForm, line: e.target.value })}
                  placeholder={slack?.labelDefaults?.line}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </label>
              <div className="flex flex-wrap gap-1.5" aria-label="กดเพื่อเพิ่มตัวแปรต่อท้าย">
                {LINE_VARS.map((x) => (
                  <button
                    key={x.v}
                    type="button"
                    title={x.note}
                    onClick={() => setLabelsForm({ ...labelsForm, line: `${labelsForm.line ?? ""} ${x.v}`.trim() })}
                    className="px-2.5 min-h-10 rounded-full border border-gray-300 text-xs font-mono hover:bg-gray-50"
                  >
                    {x.v}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-gray-600">เรียงแคมเปญในแต่ละกลุ่ม</span>
                <select
                  value={labelsForm.sort ?? "severity_age"}
                  onChange={(e) => setLabelsForm({ ...labelsForm, sort: e.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-10"
                >
                  {SORT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">จัดกลุ่มตาม</span>
                <select
                  value={labelsForm.group ?? "owner"}
                  onChange={(e) => setLabelsForm({ ...labelsForm, group: e.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-10"
                >
                  {GROUP_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                disabled={!!busy}
                onClick={() => run("labelreset", async () => {
                  if (!confirm("คืนข้อความทั้งหมดเป็นค่าเริ่มต้น?")) return;
                  const j = await slackCall({ labels: {} });
                  setSlack(j);
                  setLabelsForm(j.labels ?? {});
                  setLabelsPreview("");
                  setSlackMsg("คืนค่าเริ่มต้นแล้ว");
                })}
                className="px-4 min-h-11 rounded-lg border border-gray-300 text-gray-700 font-semibold disabled:opacity-40"
              >
                คืนค่าเริ่มต้น
              </button>
              <button
                disabled={!!busy}
                onClick={() => run("labelpreview", async () => {
                  const j = await slackCall({ previewLabels: labelsForm });
                  setLabelsPreview(j.text);
                })}
                className="px-4 min-h-11 rounded-lg border border-secondary text-secondary font-semibold disabled:opacity-40"
              >
                {busy === "labelpreview" ? "กำลังสร้างตัวอย่าง…" : "ดูตัวอย่าง (ไม่ส่ง Slack)"}
              </button>
              <button
                disabled={!!busy}
                onClick={() => run("labelsave", async () => {
                  const j = await slackCall({ labels: labelsForm });
                  setSlack(j);
                  setLabelsForm(j.labels ?? {});
                  setSlackMsg("บันทึกข้อความแล้ว จะใช้กับการแจ้งเตือนรอบถัดไป");
                })}
                className="px-4 min-h-11 rounded-lg bg-secondary text-white font-semibold disabled:opacity-40"
              >
                {busy === "labelsave" ? "กำลังบันทึก…" : "บันทึกข้อความ"}
              </button>
            </div>
            {labelsPreview && <pre className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap font-sans">{labelsPreview}</pre>}
          </div>
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

      {helpOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-stretch sm:items-center justify-center sm:p-5" onClick={() => setHelpOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="slack-help-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto bg-white sm:rounded-xl shadow-xl p-5 sm:p-6 space-y-5 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="slack-help-title" className="text-lg font-semibold">วิธีแก้ข้อความแจ้งเตือน Slack</h2>
              <button autoFocus type="button" onClick={() => setHelpOpen(false)} aria-label="ปิด" className="shrink-0 w-10 h-10 rounded-lg border border-gray-300 text-gray-600 text-lg">✕</button>
            </div>

            <section className="space-y-1.5">
              <h3 className="font-semibold">ขั้นตอน</h3>
              <ol className="list-decimal pl-5 space-y-1 text-gray-700">
                <li>แก้ช่องที่ต้องการ ช่องที่เว้นว่างจะใช้ข้อความเริ่มต้น</li>
                <li>กด <strong>ดูตัวอย่าง (ไม่ส่ง Slack)</strong> ระบบสร้างข้อความจากข้อมูลจริงล่าสุดให้ดู ยังไม่บันทึกและไม่ส่งอะไร</li>
                <li>พอใจแล้วกด <strong>บันทึกข้อความ</strong></li>
                <li>ข้อความใหม่จะใช้ตอน n8n ส่งสรุปรอบถัดไป (ส่งวันละครั้งต่อวันข้อมูล) ถ้าวันนี้ส่งไปแล้ว จะเห็นผลในรอบของวันข้อมูลถัดไป</li>
              </ol>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">รูปแบบบรรทัดของแต่ละแคมเปญ</h3>
              <p className="text-gray-700">พิมพ์ตัวแปรในวงเล็บปีกกา ระบบแทนด้วยค่าจริงของแต่ละแคมเปญ สลับตำแหน่ง ลบ หรือเปลี่ยนเครื่องหมายคั่นเองได้</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[480px]">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr><th className="px-3 py-2 font-medium">ตัวแปร</th><th className="px-3 py-2 font-medium">คืออะไร</th><th className="px-3 py-2 font-medium">ตัวอย่างค่า</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {LINE_VARS.map((x) => (
                      <tr key={x.v}><td className="px-3 py-2 font-mono">{x.v}</td><td className="px-3 py-2">{x.note}</td><td className="px-3 py-2 text-gray-600">{x.ex}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-gray-700">ตัวแปรที่ไม่มีค่าในหมวดนั้นจะถูกตัดออก พร้อมจัดเครื่องหมาย <code>,</code> <code>()</code> <code>[]</code> ที่ค้างอยู่ให้ ส่วนเครื่องหมายอื่นที่พิมพ์เอง (เช่น <code>·</code> <code>|</code> <code>—</code>) จะอยู่ตามที่พิมพ์ จึงควรกดดูตัวอย่างก่อนบันทึก</p>
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-800">ตัวอย่างรูปแบบ (กดปุ่มเพื่อใช้)</h4>
                {LINE_EXAMPLES.map((x) => (
                  <div key={x.v} className="border border-gray-200 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">{x.note}</span>
                      <button
                        type="button"
                        onClick={() => { setLabelsForm({ ...labelsForm, line: x.v, ...(x.group ? { group: x.group } : {}) }); setHelpOpen(false); }}
                        className="px-3 min-h-10 rounded-lg border border-secondary text-secondary text-xs font-semibold"
                      >
                        ใช้รูปแบบนี้
                      </button>
                    </div>
                    <div className="font-mono text-xs break-words">{x.v}</div>
                    <div className="text-xs text-gray-600 break-words">→ • {x.out}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-semibold">เรียงและจัดกลุ่ม</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li><strong>เรียงแคมเปญ:</strong> ค่าเริ่มต้นคือเร่งด่วนก่อนแล้วค้างนานสุด หรือเลือกเรียงตามวันที่พบ หรือชื่อโรงแรม ก-ฮ</li>
                <li><strong>จัดกลุ่มตามผู้ดูแล:</strong> หัวกลุ่มเป็น <code>Account: ชื่อ</code> ถ้า Account ยังไม่ถูกผูกกับ Specialist จะอยู่ในกลุ่ม “ยังไม่มีผู้ดูแล” ทั้งหมด</li>
                <li><strong>จัดกลุ่มผู้ดูแล › โรงแรม:</strong> หัวกลุ่มเป็น <code>Account: ชื่อ</code> ใต้นั้นแยกเป็นโรงแรมมีเลขลำดับ (1. 2. 3. เริ่มใหม่ในแต่ละผู้ดูแล) เรียงตามแคมเปญที่อยู่บนสุดของแต่ละโรงแรม แก้หน้าตาหัวโรงแรมได้ที่ช่อง “หัวโรงแรม” เช่น <code>*{"{n}"}. {"{hotel}"}*</code> ให้เป็นตัวหนา หรือ <code>{"{n}) {hotel}"}</code> ควรเอา <code>{"{hotel}"}</code> ออกจากรูปแบบบรรทัดเพราะชื่อโรงแรมอยู่ที่หัวข้อแล้ว</li>
                <li><strong>จัดกลุ่มตามโรงแรม:</strong> หัวกลุ่มเป็นชื่อโรงแรม อ่านง่ายเมื่อยังไม่มีผู้ดูแล แก้หน้าตาหัวได้ที่ช่อง “หัวโรงแรม (ใช้กับจัดกลุ่ม โรงแรม)” ค่าเริ่มต้นคือ <code>{"*{hotel}*"}</code> (ตัวหนา)</li>
                <li><strong>ไม่จัดกลุ่ม:</strong> เป็นรายการเดียวต่อเนื่องในแต่ละหมวด</li>
                <li>แต่ละกลุ่มแสดงสูงสุด 30 แคมเปญ ที่เหลือบอกจำนวนว่า “และอีก N แคมเปญ”</li>
              </ul>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-semibold">ข้อควรรู้</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>รูปแบบบรรทัดต้องมี <code>{"{campaign}"}</code> และใช้ได้เฉพาะตัวแปรในตาราง ถ้าสะกดผิดระบบจะแจ้งว่าผิดตรงไหนและไม่บันทึก</li>
                <li>ใน Slack ใช้ <code>*ข้อความ*</code> ทำตัวหนา เช่นหัวเรื่องและหัวข้อ</li>
                <li><code>{"{date}"}</code> ในหัวเรื่อง แทนวันที่ของข้อมูล และ <code>{"{link}"}</code> ในข้อความท้าย แทนลิงก์ไปหน้า ADSCAN</li>
                <li>กด <strong>คืนค่าเริ่มต้น</strong> เพื่อกลับไปใช้ข้อความเดิมทั้งหมด ทุกครั้งที่บันทึกจะมีบันทึกใน Log การใช้งานว่าใครแก้</li>
              </ul>
            </section>

            <div className="flex justify-end">
              <button type="button" onClick={() => setHelpOpen(false)} className="px-4 min-h-11 rounded-lg bg-secondary text-white font-semibold">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
