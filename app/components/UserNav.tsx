"use client";

import { useRouter, usePathname } from "next/navigation";

const USER_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
];

type User = { display_name?: string | null; username: string };

type Props = {
  subtitle?: string;
  user?: User | null;
  authLoading?: boolean;
  onLogout?: () => void;
  children?: React.ReactNode; // slot for filter row below
};

export default function UserNav({ subtitle, user, authLoading, onLogout, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    if (onLogout) { onLogout(); return; }
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <div className="sticky top-0 z-30 bg-primary shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
              <span className="text-primary font-bold text-sm">H+</span>
            </div>
            <div>
              <span className="text-lg font-bold text-secondary tracking-tight block leading-tight">HOTEL PLUS</span>
              {subtitle && <span className="text-xs text-secondary/70">{subtitle}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {USER_LINKS.map((link) => (
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
            {authLoading ? (
              <span className="text-xs text-gray-400">...</span>
            ) : user ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-secondary rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">
                      {(user.display_name || user.username).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-secondary font-medium">
                    {user.display_name || user.username}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm bg-secondary text-white font-medium px-3 py-1.5 rounded-lg hover:bg-secondary-light transition-colors"
                >
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="text-sm bg-secondary text-white font-medium px-3 py-1.5 rounded-lg hover:bg-secondary-light transition-colors"
              >
                เข้าสู่ระบบ
              </button>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
