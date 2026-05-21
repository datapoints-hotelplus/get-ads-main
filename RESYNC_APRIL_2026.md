# Re-sync April 2026 Data - Purchase Value Fix

## Problem

The purchase action variant matching had a bug where only 2 of 5 possible Facebook purchase action types were being recognized:
- ❌ Missing: `omni_purchase`
- ✅ Captured: `purchase`
- ✅ Captured: `offsite_conversion.fb_pixel_purchase`
- ❌ Missing: `onsite_web_purchase`
- ❌ Missing: `web_in_store_purchase`

If your "Phapok Eco Resort" (or other accounts) use the missing variants, the `purchase_value` was recorded as 0, making ROAS show as 0 even though Facebook Manager shows revenue.

## Fix Applied

All sync endpoints have been updated to recognize all 5 purchase variants:
- `app/api/sync-7days/route.ts`
- `app/api/sync-daily/route.ts`
- `app/api/sync-backfill/route.ts`
- `app/api/sync-insights/route.ts`
- `app/api/insights/route.ts`

## How to Re-sync April 2026

Use the sync-backfill endpoint to re-sync the affected date range:

```bash
curl -X POST "http://localhost:3000/api/sync-backfill?dateFrom=2026-04-01&dateTo=2026-04-30"
```

Or navigate to **Admin → Sync Panel** and use the "Sync Range" option to set:
- **From:** 2026-04-01
- **To:** 2026-04-30
- Click **Sync**

This will re-fetch all April 2026 data from Facebook API and update the database with correct `purchase_value`.

## Verification

After re-syncing, check the dashboard:
1. Go to **Dashboard**
2. Select date range: **2026-04-01** to **2026-04-30**
3. Select account: **Phapok Eco Resort**
4. ROAS should now match Facebook Manager

If it still shows 0, the account may use a variant type not yet listed. Contact support to debug further.

## What Changed in Code

The `findAction()` and `findVideoAction()` functions now check all 5 variants in order:

```typescript
const PURCHASE_VARIANTS = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
  "web_in_store_purchase",
];
```

This matches the existing logic in `lib/facebook.ts::fetchAccountPurchaseRoas()`.
