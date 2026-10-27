import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/sessionToken";
import { homeFor } from "@/lib/access";
import { getUserPlatforms } from "@/lib/userPlatforms";

/**
 * "/" is the router: it sends each role to its own landing page. proxy.ts
 * bounces anyone off a page they can't open back here, so this is the single
 * place that decides "where do you belong".
 */
export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) redirect("/login");
  redirect(homeFor(session.role, await getUserPlatforms(session.userId, session.role)));
}
