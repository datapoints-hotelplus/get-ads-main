"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MainMenu from "@/app/components/MainMenu";
import type { MenuGroup } from "@/lib/access";

/**
 * The one header, on every logged-in page. Replaces AdminNav and UserNav,
 * which had drifted into two different layouts (full-width vs centred,
 * sticky vs not, "Logout" vs "ออกจากระบบ") so the top bar changed shape
 * depending on which page you were on.
 *
 * Fetches the user and their menu itself in one request, so no page has to
 * thread `user` through. `children` is the slot under the bar — the FB
 * dashboard puts its filter row there.
 */

type Me = { username: string; display_name?: string | null };

export default function AppHeader({ subtitle, children }: { subtitle?: string; children?: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState<MenuGroup[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/user/auth")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setMe(d?.user ?? null);
        setMenu(d?.menu ?? []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function logout() {
    await fetch("/api/user/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  const name = me ? me.display_name || me.username : "";

  return (
    <div className="sticky top-0 z-30 bg-primary shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
              <span className="text-primary font-bold text-sm">H+</span>
            </div>
            <div>
              <span className="text-lg font-bold text-secondary tracking-tight block leading-tight">HOTEL PLUS</span>
              {subtitle && <span className="text-xs text-secondary/70">{subtitle}</span>}
            </div>
          </Link>

          <div className="flex items-center gap-5 flex-wrap">
            <MainMenu menu={menu} />
            {!loaded ? (
              <span className="text-xs text-secondary/50">…</span>
            ) : me ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-secondary rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-sm text-secondary font-medium">{name}</span>
                </div>
                <button
                  onClick={logout}
                  className="text-sm bg-secondary text-white font-medium px-3 py-1.5 rounded-lg hover:bg-secondary-light transition-colors"
                >
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="text-sm bg-secondary text-white font-medium px-3 py-1.5 rounded-lg hover:bg-secondary-light transition-colors"
              >
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}
