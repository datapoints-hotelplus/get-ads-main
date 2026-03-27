import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { VALID_TOKEN } from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body as {
    username?: string;
    password?: string;
  };

  if (username !== "admin" || password !== "admin123!") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set("admin_session", VALID_TOKEN, {
    httpOnly: true,
    path: "/",
    maxAge: 86400,
    sameSite: "lax",
  });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_session");
  return NextResponse.json({ success: true });
}
