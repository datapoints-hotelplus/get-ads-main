/**
 * lib/adDate.ts
 * Calendar dates in the ad account's own timezone.
 *
 * TikTok (and Facebook) report in the AD ACCOUNT's timezone, not UTC: a
 * report asked for "2026-10-02" comes back as that account's 2026-10-02,
 * which is exactly what Ads Manager shows on screen. The sync routes were
 * deriving those date strings from `new Date()`, i.e. the server clock, which
 * on Vercel is UTC. Thailand is UTC+7, so between 00:00 and 06:59 Bangkok
 * time the server is still on the previous calendar day and "yesterday" came
 * out one day early — a cron at midnight silently synced the wrong day, every
 * day, and nothing downstream could tell.
 *
 * Doing the arithmetic in the account's timezone makes the result independent
 * of when the cron fires and of where it runs.
 *
 * ponytail: one timezone constant, not a per-advertiser lookup. Every ad
 * account on this deployment is Thai (confirmed via /bc/get/: timezone
 * "Asia/Bangkok" on all three Business Centers). If accounts in other
 * timezones are ever added, take the timezone from /advertiser/info/ and pass
 * it in — these helpers already accept one.
 */

export const DEFAULT_AD_TIMEZONE = "Asia/Bangkok";

/**
 * Today's date in `timeZone`, as "YYYY-MM-DD".
 *
 * en-CA formats as YYYY-MM-DD, which avoids hand-assembling the string from
 * parts and the off-by-one that padding mistakes introduce.
 */
export function todayIn(timeZone: string = DEFAULT_AD_TIMEZONE): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

/**
 * `days` before today in `timeZone`, as "YYYY-MM-DD". `daysAgoIn(1)` is
 * yesterday — the last day whose numbers are complete.
 *
 * Shifts by whole days on a UTC-noon anchor, so DST transitions in other
 * timezones can't roll the date over by landing near midnight.
 */
export function daysAgoIn(days: number, timeZone: string = DEFAULT_AD_TIMEZONE): string {
  const [y, m, d] = todayIn(timeZone).split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  anchor.setUTCDate(anchor.getUTCDate() - days);
  return anchor.toISOString().slice(0, 10);
}
