import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";

const COOKIE_NAME = "session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Read JWT from single cookie
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // ── Admin routes (/admin/* and /api/admin/*) ────────────────────────────
  const isAdminPage =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  const isAdminApi =
    pathname.startsWith("/api/admin") &&
    !pathname.startsWith("/api/admin/auth");

  if (isAdminPage || isAdminApi) {
    if (!session || session.role !== "admin") {
      if (isAdminPage) {
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── TikTok dashboard (view-only) — any logged-in role, same split as the
  //    Facebook /dashboard block below: middleware only checks "logged in",
  //    the page itself hides Settings/Export for role !== "admin" (AC10).
  const isTikTokDashboardPage = pathname.startsWith("/tiktok/dashboard");
  const isTikTokDashboardApi =
    pathname === "/api/tiktok/dashboard" ||
    pathname.startsWith("/api/tiktok/dashboard/") ||
    pathname === "/api/tiktok/status";

  if (isTikTokDashboardPage || isTikTokDashboardApi) {
    if (!session) {
      if (isTikTokDashboardPage) return NextResponse.redirect(new URL("/admin/login", req.url));
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-id", session.userId);
    requestHeaders.set("x-user-role", session.role);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── Every other TikTok route (/tiktok/sync — Settings — and every
  //    mutating/API-secret-bearing endpoint) — admin only, unchanged ──────
  const isTikTokPage = pathname.startsWith("/tiktok");
  const isTikTokApi = pathname.startsWith("/api/tiktok");

  if (isTikTokPage || isTikTokApi) {
    if (!session || session.role !== "admin") {
      if (isTikTokPage) {
        // A logged-in Viewer landing on the Settings page gets bounced to
        // the dashboard they DO have access to, not a login loop.
        return NextResponse.redirect(new URL(session ? "/tiktok/dashboard" : "/admin/login", req.url));
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── User-facing routes (dashboard, summary, sync and their APIs) ────────
  const isUserPage = pathname.startsWith("/facebook/dashboard");
  const isUserApi =
    pathname.startsWith("/api/dashboard") ||
    pathname.startsWith("/api/insights") ||
    pathname.startsWith("/api/ads") ||
    pathname.startsWith("/api/ads-summary") ||
    pathname.startsWith("/api/user/log");

  if (isUserPage || isUserApi) {
    if (!session) {
      if (isUserPage) return NextResponse.redirect(new URL("/login", req.url));
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestHeaders = new Headers(req.headers);
    // Inject user info for API routes
    requestHeaders.set("x-user-id", session.userId);
    requestHeaders.set("x-user-role", session.role);

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/facebook/dashboard",
    "/facebook/dashboard/:path*",
    "/summary",
    "/summary/:path*",
    "/sync",
    "/sync/:path*",
    "/api/dashboard",
    "/api/dashboard/:path*",
    "/api/insights",
    "/api/insights/:path*",
    "/api/ads",
    "/api/ads/:path*",
    "/api/ads-summary",
    "/api/ads-summary/:path*",
    "/api/user/log",
    "/tiktok",
    "/tiktok/:path*",
    "/api/tiktok",
    "/api/tiktok/:path*",
  ],
};
