"use client";

import { useState, useEffect, FormEvent } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    fetch("/api/user/auth")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          window.location.href = "/dashboard";
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        window.location.href = "/dashboard";
        return;
      } else {
        const data = await res.json();
        setError(data.error ?? "Login failed");
      }
    } catch {
      setError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* ── Header with HOTEL PLUS Branding ─────────────────────────────────── */}
        <div className="bg-primary shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
                <span className="text-primary font-bold text-sm">H+</span>
              </div>
              <div>
                <span className="text-lg font-bold text-secondary tracking-tight block leading-tight">
                  HOTEL PLUS
                </span>
                <span className="text-xs text-secondary/70">
                  Ads Management System
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* ── Loading ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-secondary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header with HOTEL PLUS Branding ─────────────────────────────────── */}
      <div className="bg-primary shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
              <span className="text-primary font-bold text-sm">H+</span>
            </div>
            <div>
              <span className="text-lg font-bold text-secondary tracking-tight block leading-tight">
                HOTEL PLUS
              </span>
              <span className="text-xs text-secondary/70">
                Ads Management System
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Login Form ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm border border-gray-200">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-secondary mb-2">
              เข้าสู่ระบบ
            </h1>
            <p className="text-sm text-gray-500">
              กรุณากรอก Username และ Password
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1.5">
                Username
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_username"
                className="w-full border border-secondary/20 rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary/30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-secondary/20 rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary/30"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3 border border-red-200">
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-secondary hover:bg-secondary-light disabled:opacity-60 text-white font-semibold px-4 py-3 rounded-lg transition-colors shadow-sm hover:shadow-md"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  กำลังเข้าสู่ระบบ…
                </span>
              ) : (
                "เข้าสู่ระบบ"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
