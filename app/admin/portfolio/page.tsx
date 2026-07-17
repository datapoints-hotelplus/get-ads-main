"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminNav from "@/app/components/AdminNav";

type Template = {
  id: string;
  name: string;
  metric: string;
  direction: "higher_better" | "lower_better";
  target: number | null;
  green_min: number | null;
  yellow_min: number | null;
  green_op: "<" | "<=" | ">" | ">=";
  yellow_op: "<" | "<=" | ">" | ">=";
};

type Profile = {
  id: string;
  name: string;
  ads_portfolio_profile_accounts: { account_id: string }[];
};

type Account = {
  account_id: string;
  account_name: string;
};

const METRICS = [
  { value: "roas", label: "ROAS" },
  { value: "spend", label: "Spend" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "ctr", label: "CTR (%)" },
  { value: "impressions", label: "Impressions" },
  { value: "clicks", label: "Clicks" },
  { value: "reach", label: "Reach" },
  { value: "leads", label: "Leads" },
  { value: "messages", label: "Messages" },
  { value: "purchases", label: "Purchases" },
  { value: "purchase_value", label: "Purchase Value" },
  { value: "cost_per_lead", label: "Cost per Lead" },
  { value: "cost_per_message", label: "Cost per Message" },
  { value: "cost_per_purchase", label: "Cost per Purchase" },
];

type View = "templates" | "profiles" | "edit-profile";

export default function AdminPortfolioPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("templates");

  // ── Templates ──────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tLoading, setTLoading] = useState(true);
  const [tError, setTError] = useState("");
  const [tSaving, setTSaving] = useState(false);
  const [editTpl, setEditTpl] = useState<Template | null>(null);
  const [newTpl, setNewTpl] = useState({
    name: "",
    metric: "roas",
    direction: "higher_better",
    target: "",
    green_min: "",
    yellow_min: "",
    green_op: ">=",
    yellow_op: ">=",
  });

  // ── Profiles ───────────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState("");
  const [pSaving, setPSaving] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfileAccounts, setEditProfileAccounts] = useState<Set<string>>(
    new Set(),
  );
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAccounts, setNewProfileAccounts] = useState<Set<string>>(
    new Set(),
  );

  async function fetchTemplates() {
    setTLoading(true);
    const res = await fetch("/api/admin/portfolio/templates");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    const data = await res.json();
    setTemplates(data.templates ?? []);
    setTLoading(false);
  }

  async function fetchProfiles() {
    setPLoading(true);
    const res = await fetch("/api/admin/portfolio/profiles");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    const data = await res.json();
    setProfiles(data.profiles ?? []);
    setAllAccounts(data.accounts ?? []);
    setPLoading(false);
  }

  useEffect(() => {
    fetchTemplates();
  }, []);
  useEffect(() => {
    if (view === "profiles" || view === "edit-profile") fetchProfiles();
  }, [view]);

  // ── Template handlers ──────────────────────────────────────────────────────
  async function handleCreateTemplate() {
    if (!newTpl.name || !newTpl.metric) return;
    setTSaving(true);
    setTError("");
    const res = await fetch("/api/admin/portfolio/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTpl.name,
        metric: newTpl.metric,
        direction: newTpl.direction,
        target: newTpl.target ? Number(newTpl.target) : null,
        green_min: newTpl.green_min ? Number(newTpl.green_min) : null,
        yellow_min: newTpl.yellow_min ? Number(newTpl.yellow_min) : null,
        green_op: newTpl.green_op,
        yellow_op: newTpl.yellow_op,
      }),
    });
    const data = await res.json();
    if (!res.ok) setTError(data.error ?? "เกิดข้อผิดพลาด");
    else {
      setNewTpl({
        name: "",
        metric: "roas",
        direction: "higher_better",
        target: "",
        green_min: "",
        yellow_min: "",
        green_op: ">=",
        yellow_op: ">=",
      });
      await fetchTemplates();
    }
    setTSaving(false);
  }

  async function handleUpdateTemplate() {
    if (!editTpl) return;
    setTSaving(true);
    setTError("");
    const res = await fetch("/api/admin/portfolio/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editTpl),
    });
    const data = await res.json();
    if (!res.ok) setTError(data.error ?? "เกิดข้อผิดพลาด");
    else {
      setEditTpl(null);
      await fetchTemplates();
    }
    setTSaving(false);
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("ลบ template นี้?")) return;
    await fetch("/api/admin/portfolio/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchTemplates();
  }

  // ── Profile handlers ───────────────────────────────────────────────────────
  async function handleCreateProfile() {
    if (!newProfileName) return;
    setPSaving(true);
    setPError("");
    const res = await fetch("/api/admin/portfolio/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newProfileName,
        account_ids: [...newProfileAccounts],
      }),
    });
    const data = await res.json();
    if (!res.ok) setPError(data.error ?? "เกิดข้อผิดพลาด");
    else {
      setNewProfileName("");
      setNewProfileAccounts(new Set());
      await fetchProfiles();
    }
    setPSaving(false);
  }

  async function handleUpdateProfile() {
    if (!editProfile) return;
    setPSaving(true);
    setPError("");
    const res = await fetch("/api/admin/portfolio/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editProfile.id,
        name: editProfileName,
        account_ids: [...editProfileAccounts],
      }),
    });
    const data = await res.json();
    if (!res.ok) setPError(data.error ?? "เกิดข้อผิดพลาด");
    else {
      setView("profiles");
      setEditProfile(null);
    }
    setPSaving(false);
  }

  async function handleDeleteProfile(id: string) {
    if (!confirm("ลบ profile นี้?")) return;
    await fetch("/api/admin/portfolio/profiles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchProfiles();
  }

  function openEditProfile(p: Profile) {
    setEditProfile(p);
    setEditProfileName(p.name);
    setEditProfileAccounts(
      new Set(p.ads_portfolio_profile_accounts.map((a) => a.account_id)),
    );
    setView("edit-profile");
  }

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  function numField(val: number | null) {
    return val === null ? "" : String(val);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AdminNav subtitle="Admin — Portfolio" />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        {/* Tab switcher */}
        <div className="flex gap-2">
          {(["templates", "profiles"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setView(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                view === t || (view === "edit-profile" && t === "profiles")
                  ? "bg-secondary text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t === "templates" ? "KPI Templates" : "Profiles"}
            </button>
          ))}
        </div>

        {/* ── TEMPLATES ──────────────────────────────────────────────────────── */}
        {view === "templates" && (
          <>
            {/* Create form */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-800 mb-4">
                เพิ่ม KPI Template
              </h2>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    ชื่อ Template
                  </label>
                  <input
                    value={newTpl.name}
                    onChange={(e) =>
                      setNewTpl((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="เช่น ROAS โรงแรม A"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Metric
                  </label>
                  <select
                    value={newTpl.metric}
                    onChange={(e) =>
                      setNewTpl((p) => ({ ...p, metric: e.target.value }))
                    }
                    className="input w-full"
                  >
                    {METRICS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Direction
                  </label>
                  <select
                    value={newTpl.direction}
                    onChange={(e) =>
                      setNewTpl((p) => ({ ...p, direction: e.target.value }))
                    }
                    className="input w-full"
                  >
                    <option value="higher_better">สูง = ดี (ROAS, CTR)</option>
                    <option value="lower_better">ต่ำ = ดี (CPC, CPM)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Target
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newTpl.target}
                    onChange={(e) =>
                      setNewTpl((p) => ({ ...p, target: e.target.value }))
                    }
                    placeholder="เป้าหมาย"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    🟢 Green
                  </label>
                  <div className="flex gap-1">
                    <select
                      value={newTpl.green_op}
                      onChange={(e) =>
                        setNewTpl((p) => ({ ...p, green_op: e.target.value }))
                      }
                      className="input w-5  flex-1"
                    >
                      <option value=">=">&gt;=</option>
                      <option value=">">&gt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="<">&lt;</option>
                    </select>
                    <input
                      type="number"
                      step="any"
                      value={newTpl.green_min}
                      onChange={(e) =>
                        setNewTpl((p) => ({ ...p, green_min: e.target.value }))
                      }
                      placeholder="เช่น 3"
                      className="input  flex-3"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    🟡 Yellow
                  </label>
                  <div className="flex gap-1 ">
                    <select
                      value={newTpl.yellow_op}
                      onChange={(e) =>
                        setNewTpl((p) => ({ ...p, yellow_op: e.target.value }))
                      }
                      className="input flex-1"
                    >
                      <option value=">=">&gt;=</option>
                      <option value=">">&gt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="<">&lt;</option>
                    </select>
                    <input
                      type="number"
                      step="any"
                      value={newTpl.yellow_min}
                      onChange={(e) =>
                        setNewTpl((p) => ({ ...p, yellow_min: e.target.value }))
                      }
                      placeholder="เช่น 2"
                      className="input flex-3"
                    />
                  </div>
                </div>
              </div>
              {tError && <p className="text-red-600 text-sm mb-2">{tError}</p>}
              <button
                onClick={handleCreateTemplate}
                disabled={tSaving || !newTpl.name}
                className="bg-secondary hover:bg-secondary-light disabled:opacity-60 text-white font-semibold px-5 py-2 rounded-lg text-sm transition"
              >
                {tSaving ? "กำลังบันทึก…" : "เพิ่ม Template"}
              </button>
            </div>

            {/* Templates list */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-base">
                  KPI Templates{" "}
                  {!tLoading && (
                    <span className="text-sm font-normal text-gray-400">
                      ({templates.length})
                    </span>
                  )}
                </h2>
              </div>
              {tLoading ? (
                <p className="px-5 py-8 text-center text-gray-400">Loading…</p>
              ) : templates.length === 0 ? (
                <p className="px-5 py-8 text-center text-gray-400">
                  ยังไม่มี template
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">ชื่อ</th>
                      <th className="px-4 py-3 font-medium">Metric</th>
                      <th className="px-4 py-3 font-medium">Direction</th>
                      <th className="px-4 py-3 font-medium">Target</th>
                      <th className="px-4 py-3 font-medium">🟢 Green</th>
                      <th className="px-4 py-3 font-medium">🟡 Yellow</th>
                      <th className="px-4 py-3 font-medium text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {templates.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        {editTpl?.id === t.id ? (
                          <>
                            <td className="px-4 py-2">
                              <input
                                value={editTpl.name}
                                onChange={(e) =>
                                  setEditTpl(
                                    (p) => p && { ...p, name: e.target.value },
                                  )
                                }
                                className="input w-full text-xs"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <select
                                value={editTpl.metric}
                                onChange={(e) =>
                                  setEditTpl(
                                    (p) =>
                                      p && { ...p, metric: e.target.value },
                                  )
                                }
                                className="input w-full text-xs"
                              >
                                {METRICS.map((m) => (
                                  <option key={m.value} value={m.value}>
                                    {m.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <select
                                value={editTpl.direction}
                                onChange={(e) =>
                                  setEditTpl(
                                    (p) =>
                                      p && {
                                        ...p,
                                        direction: e.target.value as
                                          | "higher_better"
                                          | "lower_better",
                                      },
                                  )
                                }
                                className="input w-full text-xs"
                              >
                                <option value="higher_better">สูง = ดี</option>
                                <option value="lower_better">ต่ำ = ดี</option>
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                step="any"
                                value={numField(editTpl.target)}
                                onChange={(e) =>
                                  setEditTpl(
                                    (p) =>
                                      p && {
                                        ...p,
                                        target: e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      },
                                  )
                                }
                                className="input w-20 text-xs"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <select
                                  value={editTpl.green_op}
                                  onChange={(e) =>
                                    setEditTpl(
                                      (p) =>
                                        p && {
                                          ...p,
                                          green_op: e.target.value as
                                            | "<"
                                            | "<="
                                            | ">"
                                            | ">=",
                                        },
                                    )
                                  }
                                  className="input flex-3 text-xs"
                                >
                                  <option value=">=">&gt;=</option>
                                  <option value=">">&gt;</option>
                                  <option value="<=">&lt;=</option>
                                  <option value="<">&lt;</option>
                                </select>
                                <input
                                  type="number"
                                  step="any"
                                  value={numField(editTpl.green_min)}
                                  onChange={(e) =>
                                    setEditTpl(
                                      (p) =>
                                        p && {
                                          ...p,
                                          green_min: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        },
                                    )
                                  }
                                  className="input flex-6 text-xs"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <select
                                  value={editTpl.yellow_op}
                                  onChange={(e) =>
                                    setEditTpl(
                                      (p) =>
                                        p && {
                                          ...p,
                                          yellow_op: e.target.value as
                                            | "<"
                                            | "<="
                                            | ">"
                                            | ">=",
                                        },
                                    )
                                  }
                                  className="input flex-3 text-xs"
                                >
                                  <option value=">=">&gt;=</option>
                                  <option value=">">&gt;</option>
                                  <option value="<=">&lt;=</option>
                                  <option value="<">&lt;</option>
                                </select>
                                <input
                                  type="number"
                                  step="any"
                                  value={numField(editTpl.yellow_min)}
                                  onChange={(e) =>
                                    setEditTpl(
                                      (p) =>
                                        p && {
                                          ...p,
                                          yellow_min: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        },
                                    )
                                  }
                                  className="input flex-6 text-xs"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={handleUpdateTemplate}
                                disabled={tSaving}
                                className="text-green-600 hover:text-green-800 text-xs font-medium mr-2"
                              >
                                {tSaving ? "…" : "Save"}
                              </button>
                              <button
                                onClick={() => setEditTpl(null)}
                                className="text-gray-400 hover:text-gray-600 text-xs"
                              >
                                Cancel
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {t.name}
                            </td>
                            <td className="px-4 py-3 text-gray-500 font-mono">
                              {t.metric}
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {t.direction === "higher_better"
                                ? "สูง = ดี"
                                : "ต่ำ = ดี"}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {t.target ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {t.green_min !== null
                                ? `${t.green_op} ${t.green_min}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {t.yellow_min !== null
                                ? `${t.yellow_op} ${t.yellow_min}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => setEditTpl(t)}
                                className="text-secondary hover:text-primary text-xs font-medium mr-3"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(t.id)}
                                className="text-red-600 hover:text-red-800 text-xs font-medium"
                              >
                                Delete
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── PROFILES ───────────────────────────────────────────────────────── */}
        {view === "profiles" && (
          <>
            {/* Create form */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-800 mb-4">
                เพิ่ม Profile
              </h2>
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">
                  ชื่อ Profile
                </label>
                <input
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="เช่น กลุ่มโรงแรมเชียงใหม่"
                  className="input w-full"
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-2">
                  เลือก Accounts
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {allAccounts.map((a) => (
                    <label
                      key={a.account_id}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer p-2 rounded-lg border border-gray-100 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={newProfileAccounts.has(a.account_id)}
                        onChange={(e) =>
                          setNewProfileAccounts((prev) => {
                            const next = new Set(prev);
                            e.target.checked
                              ? next.add(a.account_id)
                              : next.delete(a.account_id);
                            return next;
                          })
                        }
                        className="accent-secondary"
                      />
                      <span className="font-medium">{a.account_name}</span>
                      <span className="text-gray-400 font-mono text-xs ml-auto">
                        {a.account_id}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {pError && <p className="text-red-600 text-sm mb-2">{pError}</p>}
              <button
                onClick={handleCreateProfile}
                disabled={pSaving || !newProfileName}
                className="bg-secondary hover:bg-secondary-light disabled:opacity-60 text-white font-semibold px-5 py-2 rounded-lg text-sm transition"
              >
                {pSaving ? "กำลังบันทึก…" : "เพิ่ม Profile"}
              </button>
            </div>

            {/* Profiles list */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-base">
                  Profiles{" "}
                  {!pLoading && (
                    <span className="text-sm font-normal text-gray-400">
                      ({profiles.length})
                    </span>
                  )}
                </h2>
              </div>
              {pLoading ? (
                <p className="px-5 py-8 text-center text-gray-400">Loading…</p>
              ) : profiles.length === 0 ? (
                <p className="px-5 py-8 text-center text-gray-400">
                  ยังไม่มี profile
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {profiles.map((p) => {
                    const accountNames = p.ads_portfolio_profile_accounts.map(
                      (a) =>
                        allAccounts.find((x) => x.account_id === a.account_id)
                          ?.account_name ?? a.account_id,
                    );
                    return (
                      <div
                        key={p.id}
                        className="px-5 py-4 flex items-center justify-between gap-4"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {accountNames.length === 0
                              ? "ไม่มี account"
                              : accountNames.join(", ")}
                          </p>
                        </div>
                        <div className="flex gap-3 shrink-0">
                          <button
                            onClick={() => openEditProfile(p)}
                            className="text-secondary hover:text-primary text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteProfile(p.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── EDIT PROFILE ───────────────────────────────────────────────────── */}
        {view === "edit-profile" && editProfile && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              แก้ไข Profile
            </h2>
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">
                ชื่อ Profile
              </label>
              <input
                value={editProfileName}
                onChange={(e) => setEditProfileName(e.target.value)}
                className="input w-full"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-2">
                เลือก Accounts
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {allAccounts.map((a) => (
                  <label
                    key={a.account_id}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer p-2 rounded-lg border border-gray-100 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={editProfileAccounts.has(a.account_id)}
                      onChange={(e) =>
                        setEditProfileAccounts((prev) => {
                          const next = new Set(prev);
                          e.target.checked
                            ? next.add(a.account_id)
                            : next.delete(a.account_id);
                          return next;
                        })
                      }
                      className="accent-secondary"
                    />
                    <span className="font-medium">{a.account_name}</span>
                    <span className="text-gray-400 font-mono text-xs ml-auto">
                      {a.account_id}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {pError && <p className="text-red-600 text-sm mb-2">{pError}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleUpdateProfile}
                disabled={pSaving}
                className="bg-secondary hover:bg-secondary-light disabled:opacity-60 text-white font-semibold px-5 py-2 rounded-lg text-sm transition"
              >
                {pSaving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
              <button
                onClick={() => {
                  setView("profiles");
                  setEditProfile(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
