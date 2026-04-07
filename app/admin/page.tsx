"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";

type Account = {
  account_name: string;
  account_id: string;
  is_active: boolean;
};

export default function AdminPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  async function fetchAccounts() {
    const res = await fetch("/api/admin/accounts");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);

    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: newName, account_id: newId }),
      });

      if (res.ok) {
        setNewName("");
        setNewId("");
        await fetchAccounts();
      } else {
        const data = await res.json();
        setAddError(data.error ?? "Failed to add account");
      }
    } catch {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleToggleActive(account_id: string, current: boolean) {
    setToggleLoading(account_id);
    try {
      await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id, is_active: !current }),
      });
      setAccounts((prev) =>
        prev.map((a) =>
          a.account_id === account_id ? { ...a, is_active: !current } : a,
        ),
      );
    } finally {
      setToggleLoading(null);
    }
  }

  async function handleDelete(account_id: string) {
    setDeleteLoading(account_id);

    try {
      const res = await fetch("/api/admin/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id }),
      });

      if (res.ok) {
        setAccounts((prev) => prev.filter((a) => a.account_id !== account_id));
      }
    } finally {
      setDeleteLoading(null);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-md border-b border-gray-200/60 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-secondary">
          Admin — Manage Accounts
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin/users")}
            className="text-sm text-secondary hover:text-primary font-medium"
          >
            Manage Users
          </button>
          <button
            onClick={() => router.push("/admin/highlights")}
            className="text-sm text-secondary hover:text-primary font-medium"
          >
            Highlight Metrics
          </button>
          <button
            onClick={() => router.push("/admin/docs")}
            className="text-sm text-gray-600 hover:text-gray-800 font-medium"
          >
            📖 วิธีใช้
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Add Account Form */}
        <div
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          data-aos="fade-up"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Add Account
          </h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Business Page"
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account ID
                </label>
                <input
                  type="text"
                  required
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="act_123456789 or 123456789"
                  className="input"
                />
              </div>
            </div>

            {addError && <p className="text-red-600 text-sm">{addError}</p>}

            <button
              type="submit"
              disabled={addLoading}
              className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-black font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {addLoading ? "Adding…" : "Add Account"}
            </button>
          </form>
        </div>

        {/* Accounts Table */}
        <div
          className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
          data-aos="fade-up"
          data-aos-delay="100"
        >
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Accounts
              {!loading && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({accounts.length})
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="px-6 py-8 text-center text-gray-400">Loading…</div>
          ) : accounts.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400">
              No accounts found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-6 py-3 font-medium">#</th>
                  <th className="px-6 py-3 font-medium">Account Name</th>
                  <th className="px-6 py-3 font-medium">Account ID</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((acc, idx) => (
                  <tr key={acc.account_id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-6 py-3 text-gray-900 font-medium">
                      {acc.account_name}
                    </td>
                    <td className="px-6 py-3 text-gray-500 font-mono">
                      {acc.account_id}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() =>
                          handleToggleActive(acc.account_id, acc.is_active)
                        }
                        disabled={toggleLoading === acc.account_id}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                          acc.is_active
                            ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                            : "bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700"
                        }`}
                      >
                        {toggleLoading === acc.account_id
                          ? "…"
                          : acc.is_active
                            ? "Active"
                            : "Inactive"}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => handleDelete(acc.account_id)}
                        disabled={deleteLoading === acc.account_id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50 font-medium text-sm"
                      >
                        {deleteLoading === acc.account_id
                          ? "Deleting…"
                          : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
