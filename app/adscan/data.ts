"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdscanAlert, AdscanPayload } from "@/lib/adscanData";
import { FOLLOW_DAYS, money } from "@/lib/adscan";

export type { AdscanAlert, AdscanPayload };
export { DONE_CHOICES, SKIP_CHOICES, money, thDate, WINDOW, FOLLOW_DAYS } from "@/lib/adscan";

/** One fetch of /api/adscan per page; `reload` after recording an action. */
export function useAdscan() {
  const [data, setData] = useState<AdscanPayload | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(
    () =>
      fetch("/api/adscan")
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || r.statusText);
          setData(j);
        })
        .catch((e: Error) => setError(e.message)),
    [],
  );
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload };
}

export const hotelName = (d: AdscanPayload, id: string) => d.hotels.find((h) => h.id === id)?.name ?? id;

/** Fixed in the last FOLLOW_DAYS days → before (at the click) vs now. */
export function followUps(d: AdscanPayload) {
  const cutoff = Date.now() - FOLLOW_DAYS * 864e5;
  const latestPer = new Map<string, (typeof d.actions)[number]>();
  for (const a of d.actions) if (!latestPer.has(a.campaign_id)) latestPer.set(a.campaign_id, a); // newest first
  return [...latestPer.values()]
    .filter((a) => a.type === "fixed" && Date.parse(a.created_at) >= cutoff)
    .map((act) => {
      const alert = d.alerts.find((x) => x.id === act.campaign_id);
      const dec = alert?.dec ?? 0;
      const now = alert?.value ?? null;
      const better = now != null && act.value_at != null && now < act.value_at;
      const days = Math.max(1, Math.ceil((Date.now() - Date.parse(act.created_at)) / 864e5));
      return {
        act, alert, days,
        result: !alert ? "Campaign หยุดยิงแล้ว"
          : act.value_at == null || now == null ? `กำลังติดตามผล (วันที่ ${days})`
          : `${better ? "ดีขึ้น" : "ยังไม่ดีขึ้น"} · ${money(act.value_at, dec)} → ${money(now, dec)}`,
        sev: !alert || act.value_at == null || now == null ? ("follow" as const) : better ? ("ok" as const) : ("critical" as const),
      };
    });
}

