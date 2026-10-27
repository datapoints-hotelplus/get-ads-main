/**
 * lib/access.ts
 * The one table of who may open what. proxy.ts (URL access), MainMenu (what
 * shows in the nav) and app/page.tsx (where to land after login) all read
 * from here, so a page can't be in someone's menu but blocked when they open
 * it, or open to them by URL but missing from the menu.
 *
 * Roles
 *   admin       Marcom Lead — everything
 *   specialist  Marcom staff — ADSCAN + dashboards for the ad accounts
 *               assigned to them
 *   user        Hotel client — dashboards for their own ad accounts only.
 *               Never ADSCAN: the TOR says clients have no way into it.
 *   hr          ADSCAN Performance Report only, no ad data at all
 *
 * Which ad accounts someone sees is NOT decided here — that's the per-user
 * grants in ads_user_page_permissions (Facebook) and
 * tiktok_user_advertiser_permissions (TikTok), enforced by each data API.
 * This file only decides which pages a role may open.
 *
 * Edge-safe on purpose (no Node or DB imports): proxy.ts imports it.
 */

export const ROLES = ["admin", "specialist", "user", "hr"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin (Marcom Lead)",
  specialist: "Marcom Specialist",
  user: "ลูกค้า (ดูได้ตาม Ads Account)",
  hr: "HR",
};

/**
 * Unknown or missing role → "user", the least-privileged role that can still
 * see anything. Every admin check in the codebase is `=== "admin"`, so this
 * can never accidentally grant admin.
 */
export function toRole(value: unknown): Role {
  return (ROLES as readonly string[]).includes(value as string) ? (value as Role) : "user";
}

const DASHBOARD_ROLES: Role[] = ["admin", "specialist", "user"];
const ALL_ROLES: Role[] = [...ROLES];

/**
 * Page access, most specific prefix first — the first match wins, so
 * /tiktok/dashboard must sit above /tiktok. A path with no matching rule is
 * public (login, privacy).
 */
const PAGE_RULES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/facebook/portfolio", roles: ["admin"] }, // its profile list API was already admin-only
  { prefix: "/facebook", roles: DASHBOARD_ROLES },
  { prefix: "/tiktok/dashboard", roles: DASHBOARD_ROLES },
  { prefix: "/tiktok", roles: ["admin"] }, // /tiktok/sync — settings
  { prefix: "/adscan/report", roles: ["admin", "hr"] }, // TOR: Performance Report — per-person numbers, no ad data
  { prefix: "/adscan", roles: ["admin", "specialist"] }, // TOR: clients never see ADSCAN
  { prefix: "/account", roles: ALL_ROLES },
  { prefix: "/no-access", roles: ALL_ROLES },
  { prefix: "/admin", roles: ["admin"] },
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** null = public page, no login needed. */
export function pageRoles(pathname: string): Role[] | null {
  return PAGE_RULES.find((r) => matches(pathname, r.prefix))?.roles ?? null;
}

export function canOpen(role: Role, pathname: string): boolean {
  const roles = pageRoles(pathname);
  return roles === null || roles.includes(role);
}

/** Which platforms this person has at least one ad account on. */
export type Platforms = { facebook: boolean; tiktok: boolean };

/** Where to land after login, or after being bounced off a page. */
export function homeFor(role: Role, platforms: Platforms): string {
  if (role === "hr") return "/adscan/report";
  if (role === "admin") return "/facebook/dashboard";
  if (role === "specialist") return "/adscan";
  if (platforms.facebook) return "/facebook/dashboard";
  if (platforms.tiktok) return "/tiktok/dashboard";
  return "/no-access";
}

// ── Menu ────────────────────────────────────────────────────────────────────

export type MenuLink = { href: string; label: string };
export type MenuGroup = { label: string; links: MenuLink[] };

type MenuItem = MenuLink & { platform?: keyof Platforms };

/**
 * Grouped by what the page is for, not by "is this an admin page" — that
 * split is what made the old two menus confusing (Sync for Facebook lived
 * under Facebook, Sync for TikTok under TikTok, Manage Users under Account).
 * Visibility is NOT declared here: an item shows exactly when canOpen() says
 * the role may open it, so the menu and proxy.ts cannot disagree.
 */
const MENU: { label: string; items: MenuItem[] }[] = [
  {
    label: "ADSCAN",
    items: [
      { href: "/adscan", label: "งานของฉัน" },
      { href: "/adscan/hotels", label: "โรงแรมของฉัน" },
      { href: "/adscan/history", label: "ประวัติ" },
      { href: "/adscan/report", label: "Performance Report" },
    ],
  },
  {
    label: "Facebook",
    items: [
      { href: "/facebook/dashboard", label: "Dashboard", platform: "facebook" },
      { href: "/facebook/portfolio", label: "Portfolio", platform: "facebook" },
    ],
  },
  {
    label: "TikTok",
    items: [{ href: "/tiktok/dashboard", label: "Dashboard", platform: "tiktok" }],
  },
  {
    label: "ตั้งค่า",
    items: [
      { href: "/admin/users", label: "ผู้ใช้งาน" },
      { href: "/admin", label: "Ads Account (Facebook)" },
      { href: "/admin/sync", label: "Sync Facebook" },
      { href: "/tiktok/sync", label: "Sync & ตั้งค่า TikTok" },
      { href: "/admin/highlights", label: "Highlight Metrics" },
      { href: "/admin/portfolio", label: "Portfolio Template" },
      { href: "/admin/adscan-skill", label: "AI Skill (ADSCAN)" },
      { href: "/admin/config", label: "System Config" },
    ],
  },
  {
    label: "บัญชี",
    items: [
      { href: "/admin/docs", label: "วิธีใช้" },
      { href: "/account/password", label: "เปลี่ยนรหัสผ่าน" },
    ],
  },
];

/**
 * The menu one person sees. Admin always sees both platforms — they manage
 * every account regardless of grants. Empty groups are dropped.
 */
export function menuFor(role: Role, platforms: Platforms): MenuGroup[] {
  const has = (p?: keyof Platforms) => !p || role === "admin" || platforms[p];
  return MENU.map((g) => ({
    label: g.label,
    links: g.items
      .filter((i) => canOpen(role, i.href) && has(i.platform))
      .map(({ href, label }) => ({ href, label })),
  })).filter((g) => g.links.length > 0);
}
