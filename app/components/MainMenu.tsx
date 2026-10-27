"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { MenuGroup } from "@/lib/access";

/**
 * The one menu, for every role. AppHeader passes in what /api/user/auth
 * returns (built by menuFor() in lib/access.ts), so this component holds no
 * rules of its own — what someone sees here is exactly what proxy.ts lets
 * them open.
 *
 * Replaces the two hand-maintained link lists that used to live in AdminNav
 * and UserNav and had drifted apart.
 */

function NavGroup({ group, pathname, dot }: { group: MenuGroup; pathname: string; dot?: "green" | "red" | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = group.links.some((l) => l.href === pathname);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const tone = active ? "text-secondary" : "text-secondary/70 hover:text-secondary";
  const dotEl = dot && <span className={`w-1.5 h-1.5 rounded-full ${dot === "green" ? "bg-green-400" : "bg-red-400"}`} />;

  // A group with a single page is just a link — a dropdown of one is noise.
  if (group.links.length === 1) {
    const only = group.links[0];
    return (
      <button onClick={() => router.push(only.href)} className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${tone}`}>
        {dotEl}
        {group.label}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${tone}`}>
        {dotEl}
        {group.label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1.5 z-50">
          {group.links.map((link) => (
            <button
              key={link.href}
              onClick={() => {
                setOpen(false);
                router.push(link.href);
              }}
              className={`block w-full text-left px-3.5 py-2 text-sm hover:bg-gray-50 ${
                link.href === pathname ? "text-secondary font-semibold" : "text-gray-700"
              }`}
            >
              {link.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MainMenu({ menu }: { menu: MenuGroup[] }) {
  const pathname = usePathname() ?? "";
  const [tiktokConnected, setTiktokConnected] = useState<boolean | null>(null);
  const showsTikTok = menu.some((g) => g.label === "TikTok");

  // Only ask for TikTok status when the TikTok menu is actually shown —
  // HR and Facebook-only clients aren't allowed to call it anyway.
  useEffect(() => {
    if (!showsTikTok) return;
    fetch("/api/tiktok/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setTiktokConnected(s.connected !== false))
      .catch(() => {});
  }, [showsTikTok]);

  return (
    <>
      {menu.map((g) => (
        <NavGroup
          key={g.label}
          group={g}
          pathname={pathname}
          dot={g.label === "TikTok" && tiktokConnected !== null ? (tiktokConnected ? "green" : "red") : null}
        />
      ))}
    </>
  );
}
