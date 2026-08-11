"use client";

import { useRouter, usePathname } from "next/navigation";

const ADMIN_LINKS = [
  { href: "/admin", label: "Manage Accounts" },
  { href: "/admin/users", label: "Manage Users" },
  { href: "/admin/highlights", label: "Highlight Metrics" },
  { href: "/admin/portfolio", label: "Portfolio" },
  { href: "/admin/sync", label: "Sync Panel" },
  { href: "/admin/docs", label: "วิธีใช้" },
  { href: "/admin/change-password", label: "เปลี่ยนรหัสผ่าน" },
];

type Props = {
  subtitle?: string;
  onLogout?: () => void;
};

export default function AdminNav({ subtitle, onLogout }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    if (onLogout) { onLogout(); return; }
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

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
      <div className="flex items-center gap-4">
        {ADMIN_LINKS.map((link) => (
          <button
            key={link.href}
            onClick={() => router.push(link.href)}
            className={`text-sm font-medium transition-colors ${
              pathname === link.href
                ? "text-secondary"
                : "text-secondary/70 hover:text-secondary"
            }`}
          >
            {link.label}
          </button>
        ))}
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
