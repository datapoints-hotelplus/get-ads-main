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

  // ── User-facing routes (dashboard, summary, sync and their APIs) ────────
  const isUserPage = pathname.startsWith("/dashboard");
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
    "/dashboard",
    "/dashboard/:path*",
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
  ],
};
