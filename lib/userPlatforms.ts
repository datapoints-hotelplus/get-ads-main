/**
 * lib/userPlatforms.ts
 * Which platforms a user has at least one ad account granted on — drives the
 * menu and the post-login landing page (lib/access.ts). Server-only: reads
 * the two grant tables, so it can't live in the edge-safe access.ts.
 *
 * Admins aren't looked up: they see every account on every platform.
 */
import { getSupabase } from "@/lib/supabase";
import type { Platforms, Role } from "@/lib/access";

export async function getUserPlatforms(userId: string, role: Role): Promise<Platforms> {
  if (role === "admin") return { facebook: true, tiktok: true };
  if (role === "hr") return { facebook: false, tiktok: false }; // never sees ad data, grants or not

  const sb = getSupabase();
  const [fb, tt] = await Promise.all([
    sb.from("ads_user_page_permissions").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    sb.from("tiktok_user_advertiser_permissions").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return { facebook: (fb.count ?? 0) > 0, tiktok: (tt.count ?? 0) > 0 };
}
