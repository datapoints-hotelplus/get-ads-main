"use client";

import { useEffect, useState } from "react";

/** F05: TikTok connection dot shown in the shared header (Admin + User nav). */
export function useTikTokStatus() {
  const [connected, setConnected] = useState<boolean | null>(null); // null = unknown yet
  useEffect(() => {
    fetch("/api/tiktok/status")
      .then((r) => r.json())
      .then((s) => setConnected(s.connected !== false))
      .catch(() => {});
  }, []);
  return connected;
}
