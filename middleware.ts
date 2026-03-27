import { NextRequest, NextResponse } from "next/server";
import { VALID_TOKEN } from "@/lib/adminAuth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /admin routes (but NOT /admin/login or /api/admin/auth)
  const isAdminPage = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  const isAdminApi =
    pathname.startsWith("/api/admin") && !pathname.startsWith("/api/admin/auth");

  if (isAdminPage || isAdminApi) {
    const token = req.cookies.get("admin_session")?.value;
    if (token !== VALID_TOKEN) {
      if (isAdminPage) {
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
