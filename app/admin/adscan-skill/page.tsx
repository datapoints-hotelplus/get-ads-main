"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactSelect from "react-select";
import AppHeader from "@/app/components/AppHeader";
import type { AdscanPayload } from "@/lib/adscanData";

type SkillRow = { version: number; model: string; prompt: string; note: string | null; is_active: boolean; created_at: string; by: string };
const card = "bg-white border border-gray-200 rounded-xl shadow-sm";
const LABEL_FIELDS: { k: string; label: string }[] = [
  { k: "fresh", label: "ชื่อหมวด: พบปัญหาใหม่" },
  { k: "pending", label: "ชื่อหมวด: ยังไม่ได้แก้" },
  { k: "fixed", label: "ชื่อหมวด: กลับมาปกติแล้ว" },
  { k: "stopped", label: "ชื่อหมวด: หยุดติดตาม" },
  { k: "noOwner", label: "ชื่อกลุ่มเมื่อไม่มีผู้ดูแล" },
  { k: "empty", label: "ข้อความเมื่อไม่มีเรื่องต้องดูแล" },
];
const SORT_OPTIONS = [
  { v: "severity_age", label: "เร่งด่วนก่อน แล้วค้างนานสุด" },
  { v: "age", label: "ค้างนานสุดก่อน" },
  { v: "newest", label: "เพิ่งพบก่อน" },
  { v: "hotel", label: "ชื่อโรงแรม ก-ฮ" },
];
/** Placeholders by the kind of line they go on (what the server accepts, see slackTemplateToLabels). */
const PLACEHOLDERS: { where: string; vars: { v: string; note: string; ex: string }[] }[] = [
  { where: "หัวเรื่อง (บนสุด)", vars: [{ v: "{date}", note: "วันที่ของข้อมูล", ex: "9 พ.ย. 2569" }] },
  { where: "หัวหมวด", vars: [{ v: "{section}", note: "ชื่อหมวด (พบปัญหาใหม่ ยังไม่ได้แก้ …)", ex: "ยังไม่ได้แก้" }, { v: "{count}", note: "จำนวนแคมเปญในหมวด", ex: "7" }] },
  { where: "หัวผู้ดูแล", vars: [{ v: "{owner}", note: "ชื่อผู้ดูแล", ex: "Beer Marcom" }] },
  { where: "หัวโรงแรม", vars: [{ v: "{n}", note: "เลขลำดับ 1, 2, 3 …", ex: "1" }, { v: "{hotel}", note: "ชื่อโรงแรม", ex: "Sea U Pattaya" }] },
  {
    where: "บรรทัดแคมเปญ",
    vars: [
      { v: "{campaign}", note: "ชื่อแคมเปญ (ต้องมีเสมอ)", ex: "ENG VDO | Sea u pattaya" },
      { v: "{hotel}", note: "ชื่อโรงแรม", ex: "Sea U Pattaya H+" },
      { v: "{metric}", note: "ชนิดต้นทุน (ไม่มีในหมวด “หยุดติดตาม”)", ex: "ต้นทุนต่อ Engagement" },
      { v: "{status}", note: "สถานะ", ex: "สูงเกินเกณฑ์" },
      { v: "{severity}", note: "ระดับ (ไม่มีในหมวด “กลับมาปกติแล้ว” และ “หยุดติดตาม”)", ex: "ควรดู" },
      { v: "{days}", note: "จำนวนวันที่ค้าง (มีเฉพาะหมวด “ยังไม่ได้แก้”)", ex: "ค้างมา 4 วัน" },
    ],
  },
  { where: "ข้อความท้าย (ล่างสุด)", vars: [{ v: "{link}", note: "ลิงก์ไปหน้า ADSCAN", ex: "ADSCAN" }] },
];
const TEMPLATE_HEAD = "*สรุปแคมเปญที่ต้องดูแล ข้อมูลวันที่ {date}*\n\n*{section} {count} แคมเปญ*\n\n";
const TEMPLATE_FOOT = "\n\nดูรายละเอียดได้ที่ {link}";
const TEMPLATE_EXAMPLES: { note: string; text: string; out: string }[] = [
  {
    note: "แบบเริ่มต้น: จัดกลุ่มตามผู้ดูแล",
    text: `${TEMPLATE_HEAD}*Account: {owner}*\n{hotel} — {campaign} ({metric} {status}, {severity}, {days})${TEMPLATE_FOOT}`,
    out: "Account: Beer Marcom\n• Sea U Pattaya — MES | SEA U PATTAYA (ต้นทุนต่อข้อความ สูงเกินเกณฑ์, เร่งด่วน, ค้างมา 56 วัน)",
  },
  {
    note: "ผู้ดูแล › โรงแรม แยกโรงแรมมีเลขลำดับ (ไม่ใส่ชื่อโรงแรมในบรรทัดแคมเปญ)",
    text: `${TEMPLATE_HEAD}*Account: {owner}*\n{n}. {hotel}\n{campaign} ({metric} {status}, {severity}, {days})${TEMPLATE_FOOT}`,
    out: "Account: Beer Marcom\n1. Sea U Pattaya\n• MES | SEA U PATTAYA (ต้นทุนต่อข้อความ สูงเกินเกณฑ์, เร่งด่วน, ค้างมา 56 วัน)",
  },
  {
    note: "รวมทุกหมวดเป็นรายการเดียว ไม่มีหัวหมวด (ลบบรรทัด {section} ออก)",
    text: "*สรุปแคมเปญที่ต้องดูแล ข้อมูลวันที่ {date}*\n\n*Account: {owner}*\n{n}. {hotel}\n{campaign} ({metric} {status}, {severity}, {days})\n\nดูรายละเอียดได้ที่ {link}",
    out: "Account: Beer Marcom\n1. Sea U Pattaya\n• MES | SEA U PATTAYA (ต้นทุนต่อข้อความ สูงเกินเกณฑ์, เร่งด่วน, ค้างมา 56 วัน)\n• (แคมเปญที่กลับมาปกติแล้วอยู่ในรายการเดียวกัน ขึ้นว่า “กลับมาอยู่ในเกณฑ์”)",
  },
  {
    note: "จัดกลุ่มตามโรงแรมอย่างเดียว (หัวโรงแรมตัวหนา)",
    text: `${TEMPLATE_HEAD}*{hotel}*\n{campaign} ({metric} {status}, {severity}, {days})${TEMPLATE_FOOT}`,
    out: "Sea U Pattaya\n• MES | SEA U PATTAYA (ต้นทุนต่อข้อความ สูงเกินเกณฑ์, เร่งด่วน, ค้างมา 56 วัน)",
  },
  {
    note: "ไม่จัดกลุ่ม: รายการเดียวต่อเนื่อง",
    text: `${TEMPLATE_HEAD}{hotel} — {campaign} ({metric} {status}, {severity}, {days})${TEMPLATE_FOOT}`,
    out: "• Sea U Pattaya — MES | SEA U PATTAYA (ต้นทุนต่อข้อความ สูงเกินเกณฑ์, เร่งด่วน, ค้างมา 56 วัน)",
  },
];
/** A failed call to /api/admin/adscan-settings: `status` 0 = never reached the server; `line` = the template line to blame. */
class SlackCallError extends Error {
  status: number;
  line?: number;
  constructor(message: string, status: number, line?: number) {
    super(message);
    this.status = status;
    this.line = line;
  }
}
type SlackErr = { title: string; message: string; detail?: string; line?: number };
/** User-facing wording first (Thai); the raw status/message stays folded under “รายละเอียด”. */
function describeSlackErr(e: unknown): SlackErr {
  if (e instanceof SlackCallError && e.status === 400) return { title: "ข้อความยังไม่ถูกต้อง จึงยังไม่ได้บันทึก", message: e.message, line: e.line };
  if (e instanceof SlackCallError && e.status === 401) return { title: "หมดเวลาการเข้าสู่ระบบ", message: "กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง", detail: `HTTP ${e.status}: ${e.message}` };
  if (e instanceof SlackCallError && e.status > 0) return { title: "ระบบขัดข้อง ยังไม่ได้บันทึก", message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ", detail: `HTTP ${e.status}: ${e.message}` };
  return { title: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", message: "ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง", detail: e instanceof Error ? e.message : String(e) };
}
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
  const [slack, setSlack] = useState<{ enabled: boolean; hasUrl: boolean; urlMasked: string | null; labels?: Record<string, string>; labelDefaults?: Record<string, string>; template?: string } | null>(null);
  const [slackUrl, setSlackUrl] = useState("");
  const [slackMsg, setSlackMsg] = useState("");
  const [labelsForm, setLabelsForm] = useState<Record<string, string>>({});
  const [labelsPreview, setLabelsPreview] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [labelsErr, setLabelsErr] = useState<SlackErr | null>(null);
  const [labelsOk, setLabelsOk] = useState("");
  const templateRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHelpOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);
  async function slackCall(body: object) {
    const r = await fetch("/api/admin/adscan-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new SlackCallError(j.error || r.statusText || "ไม่สำเร็จ", r.status, j.line);
    return j;
  }
  /** Same as run() but the error is shown right under the textarea, and the faulty line is selected. */
  async function runLabels(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setLabelsErr(null);
    setLabelsOk("");
    try {
      await fn();
    } catch (e) {
      const err = describeSlackErr(e);
      setLabelsErr(err);
      const ta = templateRef.current;
      if (ta && err.line) {
        const lines = (labelsForm.template ?? "").split(/\r?\n/);
        const start = lines.slice(0, err.line - 1).reduce((n, l) => n + l.length + 1, 0);
        ta.focus();
        ta.setSelectionRange(start, start + (lines[err.line - 1]?.length ?? 0));
      }
    }
    setBusy("");
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
        setLabelsForm({ ...d.labels, template: d.template });
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
                  แก้ทั้งข้อความในช่องเดียว ระบบอ่านโครงสร้างจากบรรทัดและตัวแปรในวงเล็บปีกกา รายชื่อแคมเปญและตัวเลขสร้างจากข้อมูลจริงทุกวัน กดปุ่ม i เพื่อดูวิธีใช้
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

            <label className="block text-sm">
              <span className="text-gray-600">ข้อความทั้งหมด <span className="text-xs text-gray-400">· ใส่ *…* เพื่อทำตัวหนา · ระบบใส่ • หน้าบรรทัดแคมเปญให้เอง</span></span>
              <textarea
                id="slack-template"
                ref={templateRef}
                value={labelsForm.template ?? ""}
                onChange={(e) => setLabelsForm({ ...labelsForm, template: e.target.value })}
                rows={10}
                spellCheck={false}
                aria-invalid={!!labelsErr?.line}
                className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono leading-relaxed ${labelsErr ? "border-red-400" : "border-gray-300"}`}
              />
            </label>
            {labelsErr && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-1">
                <div className="font-semibold">{labelsErr.title}</div>
                <div>{labelsErr.message}</div>
                {labelsErr.line && <div className="text-xs text-red-700">บรรทัดที่ {labelsErr.line} ถูกเลือกไว้ในช่องข้อความให้แล้ว</div>}
                {labelsErr.detail && (
                  <details className="text-xs text-red-700">
                    <summary className="cursor-pointer">รายละเอียด</summary>
                    <pre className="mt-1 whitespace-pre-wrap">{labelsErr.detail}</pre>
                  </details>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {LABEL_FIELDS.map((f) => (
                <label key={f.k} className="block text-sm">
                  <span className="text-gray-600">{f.label}</span>
                  <input
                    value={labelsForm[f.k] ?? ""}
                    maxLength={200}
                    onChange={(e) => setLabelsForm({ ...labelsForm, [f.k]: e.target.value })}
                    placeholder={slack?.labelDefaults?.[f.k]}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              ))}
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
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                disabled={!!busy}
                onClick={() => runLabels("labelreset", async () => {
                  if (!confirm("คืนข้อความทั้งหมดเป็นค่าเริ่มต้น?")) return;
                  const j = await slackCall({ labels: {} });
                  setSlack(j);
                  setLabelsForm({ ...j.labels, template: j.template });
                  setLabelsPreview("");
                  setLabelsOk("คืนค่าเริ่มต้นแล้ว");
                })}
                className="px-4 min-h-11 rounded-lg border border-gray-300 text-gray-700 font-semibold disabled:opacity-40"
              >
                คืนค่าเริ่มต้น
              </button>
              <button
                disabled={!!busy}
                onClick={() => runLabels("labelpreview", async () => {
                  const j = await slackCall({ previewLabels: labelsForm });
                  setLabelsPreview(j.text);
                })}
                className="px-4 min-h-11 rounded-lg border border-secondary text-secondary font-semibold disabled:opacity-40"
              >
                {busy === "labelpreview" ? "กำลังสร้างตัวอย่าง…" : "ดูตัวอย่าง (ไม่ส่ง Slack)"}
              </button>
              <button
                disabled={!!busy}
                onClick={() => runLabels("labelsave", async () => {
                  const j = await slackCall({ labels: labelsForm });
                  setSlack(j);
                  setLabelsForm({ ...j.labels, template: j.template });
                  setLabelsOk("บันทึกข้อความแล้ว จะใช้กับการแจ้งเตือนรอบถัดไป");
                })}
                className="px-4 min-h-11 rounded-lg bg-secondary text-white font-semibold disabled:opacity-40"
              >
                {busy === "labelsave" ? "กำลังบันทึก…" : "บันทึกข้อความ"}
              </button>
            </div>
            {labelsOk && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">{labelsOk}</div>}
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
                <li>แก้ข้อความในช่อง “ข้อความทั้งหมด” หรือกด “ใช้แบบนี้” ที่ตัวอย่างด้านล่างแล้วแก้ต่อ</li>
                <li>กด <strong>ดูตัวอย่าง (ไม่ส่ง Slack)</strong> ระบบสร้างข้อความจากข้อมูลจริงล่าสุดให้ดู ยังไม่บันทึกและไม่ส่งอะไร</li>
                <li>พอใจแล้วกด <strong>บันทึกข้อความ</strong></li>
                <li>ข้อความใหม่จะใช้ตอน n8n ส่งสรุปรอบถัดไป (ส่งวันละครั้งต่อวันข้อมูล) ถ้าวันนี้ส่งไปแล้ว จะเห็นผลในรอบของวันข้อมูลถัดไป</li>
              </ol>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">ระบบอ่านข้อความอย่างไร</h3>
              <p className="text-gray-700">ในช่องเขียนตัวอย่างข้อความหนึ่งชุด ระบบดูว่าแต่ละบรรทัดมีตัวแปรอะไร แล้วเอาไปทำซ้ำกับข้อมูลจริง บรรทัดว่างไม่มีผล</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>บรรทัดที่มี <code>{"{campaign}"}</code> = บรรทัดของแต่ละแคมเปญ (ต้องมี และมีได้บรรทัดเดียว)</li>
                <li>บรรทัดที่มี <code>{"{section}"}</code> หรือ <code>{"{count}"}</code> = หัวหมวด (พบปัญหาใหม่ / ยังไม่ได้แก้ / กลับมาปกติแล้ว / หยุดติดตาม) <strong>ลบบรรทัดนี้ = รวมทุกหมวดเป็นรายการเดียว ไม่มีหัวหมวด</strong> (ใช้ <code>{"{status}"}</code> ในบรรทัดแคมเปญบอกว่าแคมเปญนั้นอยู่สถานะไหน)</li>
                <li>บรรทัดที่มี <code>{"{owner}"}</code> = หัวผู้ดูแล <strong>ลบบรรทัดนี้ = ไม่จัดกลุ่มตามผู้ดูแล</strong></li>
                <li>บรรทัดที่มี <code>{"{hotel}"}</code> หรือ <code>{"{n}"}</code> แต่ไม่มี <code>{"{campaign}"}</code> = หัวโรงแรม <strong>ลบบรรทัดนี้ = ไม่แยกโรงแรม</strong></li>
                <li>บรรทัดที่อยู่เหนือหัวหมวด = หัวเรื่อง และบรรทัดที่อยู่ใต้บรรทัดแคมเปญ = ข้อความท้าย ถ้าลบออก ระบบใช้ข้อความเริ่มต้น</li>
                <li>ลำดับต้องเป็น หัวหมวด › หัวผู้ดูแล › หัวโรงแรม › บรรทัดแคมเปญ สลับไม่ได้</li>
              </ul>
              <p className="text-gray-700">เมื่อมีทั้งหัวผู้ดูแลและหัวโรงแรม จะได้การจัดกลุ่มผู้ดูแล › โรงแรม เลขลำดับ <code>{"{n}"}</code> เริ่มใหม่ในแต่ละผู้ดูแล และโรงแรมเรียงตามแคมเปญที่อยู่บนสุดของโรงแรมนั้น แต่ละกลุ่มแสดงสูงสุด 30 แคมเปญ ที่เหลือบอกจำนวนว่า “และอีก N แคมเปญ”</p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">ตัวแปรที่ใช้ได้ในแต่ละบรรทัด</h3>
              <div className="overflow-x-auto space-y-3">
                {PLACEHOLDERS.map((g) => (
                  <table key={g.where} className="w-full text-left min-w-[480px]">
                    <caption className="text-left text-xs font-semibold text-gray-500 pb-1">{g.where}</caption>
                    <tbody className="divide-y divide-gray-100 border border-gray-100">
                      {g.vars.map((x) => (
                        <tr key={x.v}><td className="px-3 py-1.5 font-mono w-28">{x.v}</td><td className="px-3 py-1.5">{x.note}</td><td className="px-3 py-1.5 text-gray-600">{x.ex}</td></tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
              <p className="text-gray-700">ถ้าตัวแปรไม่มีค่าในหมวดนั้น จะถูกตัดออก พร้อมจัดเครื่องหมาย <code>,</code> <code>()</code> <code>[]</code> ที่ค้างอยู่ให้ ส่วนเครื่องหมายอื่นที่พิมพ์เอง (เช่น <code>·</code> <code>|</code> <code>—</code>) จะอยู่ตามที่พิมพ์ จึงควรกดดูตัวอย่างก่อนบันทึก</p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">ตัวอย่าง (กดเพื่อใช้)</h3>
              {TEMPLATE_EXAMPLES.map((x) => (
                <div key={x.note} className="border border-gray-200 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500">{x.note}</span>
                    <button
                      type="button"
                      onClick={() => { setLabelsForm({ ...labelsForm, template: x.text }); setHelpOpen(false); }}
                      className="shrink-0 px-3 min-h-10 rounded-lg border border-secondary text-secondary text-xs font-semibold"
                    >
                      ใช้แบบนี้
                    </button>
                  </div>
                  <pre className="font-mono text-xs whitespace-pre-wrap">{x.text}</pre>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans border-t border-dashed border-gray-200 pt-1.5">ผลลัพธ์ (ส่วนแคมเปญ):{"\n"}{x.out}</pre>
                </div>
              ))}
            </section>

            <section className="space-y-1.5">
              <h3 className="font-semibold">ช่องอื่นใต้ข้อความ</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li><strong>ชื่อหมวด 4 ช่อง</strong> คือคำที่แทน <code>{"{section}"}</code> และ <strong>ชื่อกลุ่มเมื่อไม่มีผู้ดูแล</strong> คือคำที่แทน <code>{"{owner}"}</code> เมื่อ Account ยังไม่ถูกผูกกับ Specialist</li>
                <li><strong>ข้อความเมื่อไม่มีเรื่องต้องดูแล</strong> ใช้เมื่อวันนั้นไม่มีแคมเปญให้แจ้ง</li>
                <li><strong>เรียงแคมเปญ</strong> ค่าเริ่มต้นคือเร่งด่วนก่อนแล้วค้างนานสุด หรือเลือกเรียงตามวันที่พบ หรือชื่อโรงแรม ก-ฮ</li>
                <li>ช่องที่เว้นว่างจะใช้ข้อความเริ่มต้น</li>
              </ul>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-semibold">ข้อควรรู้</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>ถ้าเขียนผิด เช่น ใช้ตัวแปรที่ไม่รู้จัก หรือสลับลำดับ ระบบจะบอกว่าผิดที่บรรทัดไหนและไม่บันทึก</li>
                <li>ใน Slack ใช้ <code>*ข้อความ*</code> ทำตัวหนา</li>
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
