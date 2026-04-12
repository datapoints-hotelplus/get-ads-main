"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SyncRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/sync");
  }, [router]);
  return null;
}
