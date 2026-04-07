"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type User = {
  id: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
};

type Account = {
  account_id: string;
  account_name: string;
};

type LogEntry = {
  id: number;
  username: string;
  page: string;
  ip_address: string | null;
  accessed_at: string;
};

type ViewMode = "users" | "permissions" | "logs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("users");

  // ── Users state ────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // ── Create user form ───────────────────────────────────────────────────────
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Reset password inline ──────────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  // ── Permissions panel ──────────────────────────────────────────────────────
  const [permUser, setPermUser] = useState<User | null>(null);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  // ── Logs state ─────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsUser, setLogsUser] = useState("");

  // ── Fetch users ────────────────────────────────────────────────────────────
  async function fetchUsers() {
    setUsersLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    const data = await res.json();
    setUsers(data.users ?? []);
    setUsersLoading(false);
  }

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Create user ────────────────────────────────────────────────────────────
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          display_name: newDisplayName,
        }),
      });
      if (res.ok) {
        setNewUsername("");
        setNewPassword("");
        setNewDisplayName("");
        await fetchUsers();
      } else {
        const d = await res.json();
        setCreateError(d.error ?? "Failed to create user");
      }
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────────
  async function handleToggleActive(user: User) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    });
    await fetchUsers();
  }

  // ── Delete user ────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Delete this user? This action cannot be undone.")) return;
    await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchUsers();
  }

  // ── Reset password ─────────────────────────────────────────────────────────
  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError("");
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetTarget, password: resetPwd }),
      });
      if (res.ok) {
        setResetTarget(null);
        setResetPwd("");
      } else {
        const d = await res.json();
        setResetError(d.error ?? "Failed to reset password");
      }
    } catch {
      setResetError("Network error");
    } finally {
      setResetLoading(false);
    }
  }

  // ── Open permissions panel ─────────────────────────────────────────────────
  async function openPermissions(user: User) {
    setPermUser(user);
    setView("permissions");
    setPermLoading(true);
    const res = await fetch(`/api/admin/users/${user.id}/permissions`);
    const data = await res.json();
    setAllAccounts(data.allAccounts ?? []);
    setGranted(new Set(data.granted ?? []));
    setPermLoading(false);
  }

  // ── Toggle a single page permission ───────────────────────────────────────
  function togglePerm(accountId: string) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  // ── Save permissions ───────────────────────────────────────────────────────
  async function savePermissions() {
    if (!permUser) return;
    setPermSaving(true);
    await fetch(`/api/admin/users/${permUser.id}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_ids: [...granted] }),
    });
    setPermSaving(false);
    setView("users");
    setPermUser(null);
  }

  // ── Load access logs ───────────────────────────────────────────────────────
  async function fetchLogs(userId?: string) {
    setLogsLoading(true);
    const url = userId
      ? `/api/admin/logs?user_id=${userId}`
      : "/api/admin/logs";
    const res = await fetch(url);
    const data = await res.json();
    setLogs(data.logs ?? []);
    setLogsLoading(false);
  }

  function openLogs(userId?: string) {
    setLogsUser(userId ?? "");
    setView("logs");
    fetchLogs(userId);
  }

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-linear-to-b from-yellow-100 to-yellow-200">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-md border-b border-gray-200/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← Accounts
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {view === "permissions" && permUser
              ? `Permissions — ${permUser.display_name ?? permUser.username}`
              : view === "logs"
                ? "Access Logs"
                : "Admin — Manage Users"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {view !== "users" && (
            <button
              onClick={() => {
                setView("users");
                setPermUser(null);
              }}
              className="text-sm text-secondary hover:text-primary font-medium"
            >
              ← Users
            </button>
          )}
          {view === "users" && (
            <button
              onClick={() => openLogs()}
              className="text-sm text-gray-600 hover:text-gray-800 font-medium"
            >
              View All Logs
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* ── USERS VIEW ─────────────────────────────────────────────────── */}
        {view === "users" && (
          <>
            {/* Create User Form */}
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
              data-aos="fade-up"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Create New User
              </h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="john_doe"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="John Doe"
                      className="input"
                    />
                  </div>
                </div>

                {createError && (
                  <p className="text-red-600 text-sm">{createError}</p>
                )}

                <button
                  type="submit"
                  disabled={creating}
                  className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-black font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  {creating ? "Creating…" : "Create User"}
                </button>
              </form>
            </div>

            {/* Users Table */}
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
              data-aos="fade-up"
              data-aos-delay="100"
            >
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  Users
                  {!usersLoading && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({users.length})
                    </span>
                  )}
                </h2>
              </div>

              {usersLoading ? (
                <div className="px-6 py-8 text-center text-gray-400">
                  Loading…
                </div>
              ) : users.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-400">
                  No users yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">#</th>
                        <th className="px-4 py-3 font-medium">Username</th>
                        <th className="px-4 py-3 font-medium">Display Name</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Created</th>
                        <th className="px-4 py-3 font-medium text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map((user, idx) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                          <td className="px-4 py-3 font-mono text-gray-900">
                            {user.username}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {user.display_name ?? (
                              <span className="text-gray-300 italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleToggleActive(user)}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                user.is_active
                                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                                  : "bg-red-100 text-red-700 hover:bg-red-200"
                              }`}
                            >
                              {user.is_active ? "Active" : "Disabled"}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {fmtDatetime(user.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => openPermissions(user)}
                                className="text-sm text-secondary hover:text-primary font-medium text-xs"
                              >
                                Pages
                              </button>
                              <button
                                onClick={() => {
                                  setResetTarget(user.id);
                                  setResetPwd("");
                                  setResetError("");
                                }}
                                className="text-yellow-600 hover:text-yellow-800 font-medium text-xs"
                              >
                                Reset pwd
                              </button>
                              <button
                                onClick={() => openLogs(user.id)}
                                className="text-gray-500 hover:text-gray-700 font-medium text-xs"
                              >
                                Logs
                              </button>
                              <button
                                onClick={() => handleDelete(user.id)}
                                className="text-red-600 hover:text-red-800 font-medium text-xs"
                              >
                                Delete
                              </button>
                            </div>

                            {/* Inline reset password form */}
                            {resetTarget === user.id && (
                              <form
                                onSubmit={handleResetPassword}
                                className="mt-2 flex items-center gap-2 justify-end"
                              >
                                <input
                                  type="text"
                                  required
                                  minLength={6}
                                  value={resetPwd}
                                  onChange={(e) => setResetPwd(e.target.value)}
                                  placeholder="New password"
                                  className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 w-36 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary"
                                />
                                <button
                                  type="submit"
                                  disabled={resetLoading}
                                  className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-black text-xs font-medium px-2 py-1 rounded"
                                >
                                  {resetLoading ? "…" : "Set"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setResetTarget(null)}
                                  className="text-gray-400 hover:text-gray-600 text-xs"
                                >
                                  Cancel
                                </button>
                                {resetError && (
                                  <span className="text-red-600 text-xs">
                                    {resetError}
                                  </span>
                                )}
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── PERMISSIONS VIEW ───────────────────────────────────────────── */}
        {view === "permissions" && permUser && (
          <div
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            data-aos="fade-up"
          >
            <p className="text-sm text-gray-500 mb-1">
              User:{" "}
              <span className="font-semibold text-gray-900">
                {permUser.username}
              </span>
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Check the ad accounts this user is allowed to view on the
              dashboard.
            </p>

            {permLoading ? (
              <p className="text-gray-400">Loading accounts…</p>
            ) : allAccounts.length === 0 ? (
              <p className="text-gray-400">
                No accounts found. Add accounts from the Accounts page first.
              </p>
            ) : (
              <div className="space-y-2 mb-6">
                {allAccounts.map((acc) => (
                  <label
                    key={acc.account_id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={granted.has(acc.account_id)}
                      onChange={() => togglePerm(acc.account_id)}
                      className="h-4 w-4 text-primary rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {acc.account_name}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">
                        {acc.account_id}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={savePermissions}
                disabled={permSaving || permLoading}
                className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-black font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {permSaving ? "Saving…" : "Save Permissions"}
              </button>
              <button
                onClick={() => {
                  setView("users");
                  setPermUser(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── LOGS VIEW ──────────────────────────────────────────────────── */}
        {view === "logs" && (
          <div
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            data-aos="fade-up"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Access Logs
                {logsUser && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    filtered by user
                  </span>
                )}
              </h2>
              {logsUser && (
                <button
                  onClick={() => openLogs()}
                  className="text-sm text-secondary hover:text-primary"
                >
                  Show all users
                </button>
              )}
            </div>

            {logsLoading ? (
              <div className="px-6 py-8 text-center text-gray-400">
                Loading…
              </div>
            ) : logs.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400">
                No logs found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 font-medium">Username</th>
                      <th className="px-4 py-3 font-medium">Page</th>
                      <th className="px-4 py-3 font-medium">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">
                          {fmtDatetime(log.accessed_at)}
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-900 text-xs">
                          {log.username}
                        </td>
                        <td className="px-4 py-2 text-gray-600 text-xs">
                          {log.page}
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-xs font-mono">
                          {log.ip_address ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
