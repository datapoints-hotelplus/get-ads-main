import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, type SessionPayload } from "@/lib/sessionToken";
import { canOpen, pageRoles, type Role } from "@/lib/access";

/**
 * Next 16 renamed middleware.ts to proxy.ts (same behaviour, see
 * node_modules/next/dist/docs/.../file-conventions/proxy.md).
 *
 * Pages: who may open what comes from lib/access.ts only. Logged out → /login;
 * logged in but not allowed → "/", which sends the role to its own landing
 * page — a client who types an admin URL lands back on their dashboard.
 *
 * APIs: this is a first gate, not the whole story. The Next docs are explicit
 * that a proxy is no full authorization layer, and the TOR's "can't cross
 * portfolios even knowing the URL" is enforced where the data is read — the
 * dashboard routes filter rows by the user's own ad-account grants.
 */

const COOKIE_NAME = "session";
const DASHBOARD_ROLES: Role[] = ["admin", "specialist", "user"];

/** Called by n8n with a Bearer secret and no cookie; each route checks it. */
const CRON_APIS = new Set([
  "/api/tiktok/sync",
  "/api/tiktok/sync-heatmap",
  "/api/tiktok/sync-windsor",
  "/api/tiktok/check-token-expiry",
  "/api/adscan/scan", // also an admin button; checked by isAuthorizedSyncCaller
]);

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** API path → roles allowed, or "public" / "cron". null = not gated here. */
function apiRule(pathname: string): Role[] | "public" | "cron" | null {
  if (under(pathname, "/api/user/auth")) return "public"; // login, logout, who-am-I
  if (CRON_APIS.has(pathname)) return "cron";
  if (under(pathname, "/api/admin")) return ["admin"];
  if (under(pathname, "/api/tiktok/dashboard") || pathname === "/api/tiktok/status") return DASHBOARD_ROLES;
  if (under(pathname, "/api/tiktok")) return ["admin"];
  if (
    under(pathname, "/api/dashboard") ||
    under(pathname, "/api/insights") ||
    under(pathname, "/api/ads")
  )
    return DASHBOARD_ROLES;
  // Was completely unauthenticated: any account's portfolio numbers for
  // whoever passed its account_ids. The only page using it is admin-only
  // (its profile list comes from /api/admin/portfolio/profiles).
  if (under(pathname, "/api/portfolio")) return ["admin"];
  if (under(pathname, "/api/adscan/report")) return ["admin", "hr"];
  if (under(pathname, "/api/adscan")) return ["admin", "specialist"]; // TOR: clients never see ADSCAN
  if (under(pathname, "/api/user")) return [...DASHBOARD_ROLES, "hr"];
  return null;
}

/** Pass the session to route handlers, which trust these over the cookie. */
function withSessionHeaders(req: NextRequest, session: SessionPayload) {
  const headers = new Headers(req.headers);
  headers.set("x-user-id", session.userId);
  headers.set("x-user-role", session.role);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname.startsWith("/api/")) {
    const rule = apiRule(pathname);
    if (rule === null || rule === "public" || rule === "cron") return NextResponse.next();
    if (!session || !rule.includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: session ? 403 : 401 });
    }
    return withSessionHeaders(req, session);
  }

  if (pageRoles(pathname) === null) return NextResponse.next(); // public page
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  if (!canOpen(session.role, pathname)) return NextResponse.redirect(new URL("/", req.url));
  return withSessionHeaders(req, session);
}

export const config = {
  matcher: [
    // Every page except Next internals and static files.
    "/((?!api|_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|ttf|woff2?|css|js|map)$).*)",
    "/api/:path*",
  ],
};
