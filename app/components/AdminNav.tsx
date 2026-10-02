"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTikTokStatus } from "@/app/hooks/useTikTokStatus";

const FACEBOOK_LINKS = [
  { href: "/facebook/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Manage Accounts" },
  { href: "/admin/highlights", label: "Highlight Metrics" },
  { href: "/admin/portfolio", label: "Portfolio" },
  { href: "/admin/sync", label: "Sync Panel" },
];

const ACCOUNT_LINKS = [
  { href: "/admin/users", label: "Manage Users" },
  { href: "/admin/docs", label: "วิธีใช้" },
  { href: "/admin/change-password", label: "เปลี่ยนรหัสผ่าน" },
];

type Props = {
  subtitle?: string;
  onLogout?: () => void;
};

/**
 * Grouped dropdown so the top nav reads as "Facebook / TikTok / Account"
 * instead of 9 flat buttons with no indication of which platform each one
 * belongs to (source of the "งง ว่าอันไหน fb อันไหน tiktok" complaint).
 * Plain useState + click-outside — no menu/popover library for 3 dropdowns.
 */
function NavGroup({
  label,
  active,
  dot,
  links,
  onNavigate,
}: {
  label: string;
  active: boolean;
  dot?: "green" | "red" | null;
  links: { href: string; label: string }[];
  onNavigate: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
          active ? "text-secondary" : "text-secondary/70 hover:text-secondary"
        }`}
      >
        {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot === "green" ? "bg-green-400" : "bg-red-400"}`} />}
        {label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1.5 z-50">
          {links.map((link) => (
            <button
              key={link.href}
              onClick={() => {
                setOpen(false);
                onNavigate(link.href);
              }}
              className="block w-full text-left px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {link.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminNav({ subtitle, onLogout }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const tiktokConnected = useTikTokStatus();

  // Self-fetched so every page using AdminNav gets the name + Logout for
  // free — matches UserNav's look on /dashboard without threading a `user`
  // prop through every admin page. Same endpoint /dashboard already uses
  // (/api/user/auth reads whichever role is on the session cookie).
  const [currentUser, setCurrentUser] = useState<{ username: string; display_name?: string | null } | null>(null);
  useEffect(() => {
    fetch("/api/user/auth")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCurrentUser(d?.user ?? null))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    if (onLogout) { onLogout(); return; }
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  const isFacebookPath = FACEBOOK_LINKS.some((l) => l.href === pathname);
  const isAccountPath = ACCOUNT_LINKS.some((l) => l.href === pathname);
  const isTikTokPath = pathname?.startsWith("/tiktok") ?? false;

  return (
    <div className="bg-primary px-6 py-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
          <span className="text-primary font-bold text-sm">H+</span>
        </div>
        <div>
          <span className="text-lg font-bold text-secondary tracking-tight block leading-tight">HOTEL PLUS</span>
          {subtitle && <span className="text-xs text-secondary/70">{subtitle}</span>}
        </div>
      </div>
      <div className="flex items-center gap-5">
        <NavGroup label="Facebook" active={isFacebookPath} links={FACEBOOK_LINKS} onNavigate={router.push} />
        <NavGroup
          label="TikTok"
          active={isTikTokPath}
          dot={tiktokConnected == null ? null : tiktokConnected ? "green" : "red"}
          links={[
            { href: "/tiktok/dashboard", label: "Dashboard" },
            { href: "/tiktok/sync", label: "Sync & Settings" },
          ]}
          onNavigate={router.push}
        />
        <NavGroup label="Account" active={isAccountPath} links={ACCOUNT_LINKS} onNavigate={router.push} />
        {currentUser && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-secondary rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="text-sm text-secondary font-medium">
              {currentUser.display_name || currentUser.username}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="text-sm bg-secondary text-white font-medium px-3 py-1.5 rounded-lg hover:bg-secondary-light transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
