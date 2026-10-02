import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/sessionToken";
import { sendAlertEmail } from "@/lib/email";

// POST /api/admin/error-cases/test-email — fires a real Resend email so F26
// (alert on consecutive sync failures) can be verified end to end from the
// error-cases test page, not just mocked in the UI.
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await sendAlertEmail(
    "[TEST] Error Handling & Resilience — F26 alert email",
    `<p>This is a test email triggered manually from /admin/error-cases.</p>
     <p>If you received this, the F26 "email alert to admin on repeated sync failure" path works.</p>
     <p>Sent at: ${new Date().toISOString()}</p>`,
  );

  return NextResponse.json({ ok: true });
}
