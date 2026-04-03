import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/sessionToken";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (token) {
    const session = await verifySessionToken(token);
    if (session) {
      redirect("/dashboard");
    }
  }
  redirect("/login");
}
