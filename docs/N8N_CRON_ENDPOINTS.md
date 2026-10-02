# TikTok Ads — n8n Cron Endpoints

รวม endpoint ทั้งหมดที่ต้องตั้ง cron จาก n8n (หรือ cron ภายนอกตัวไหนก็ได้) — ในโปรเจกต์นี้ไม่มี cron scheduler ในตัว ทุก sync ถูก trigger จากภายนอกเท่านั้น (ปุ่มในเว็บ หรือ HTTP call ตามตารางนี้)

## Auth

ทุก endpoint ใช้ header เดียวกัน:

```
Authorization: Bearer <SYNC_TRIGGER_SECRET>
```

`SYNC_TRIGGER_SECRET` คือ env var ที่ตั้งไว้บน deployment (Vercel) — ไปคัดลอกค่าจริงจากที่นั่น อย่า commit ค่าไว้ในเอกสารนี้

## Endpoints

| # | Endpoint | Method | รอบที่แนะนำ (TOR) | หมายเหตุ |
|---|---|---|---|---|
| 1 | `/api/tiktok/sync` | POST | ทุก 24 ชั่วโมง (F07) | ตัวหลัก — ads performance + campaigns + creatives + demographics + province + interests ครบชุด บัญชีแรกที่เชื่อมจะดึงย้อนหลัง 3 ปี (F11/F12) รอบถัดไปดึงแค่ 365 วัน (ปรับได้ด้วย `?lookback_days=90` เป็นต้น — ค่าเดียวกับ select "ดึงข้อมูลย้อนหลัง" ในหน้า /tiktok/sync) ใช้เวลานานได้เป็นนาที ตั้ง n8n timeout ให้เกิน 300 วิ |
| 2 | `/api/tiktok/sync-heatmap` | POST | ทุก 12 ชั่วโมง (F13) | Timing Heatmap เฉพาะ 30 วันล่าสุด (rolling window) |
| 3 | `/api/tiktok/sync-account-totals` | POST | ทุก 12 ชั่วโมง (F14) | Profile Views + New Followers ระดับ account (ตาราง `tiktok_account_totals_daily`) ดึงย้อนหลัง 30 วันเป็นค่า default (`?lookback_days=N` ปรับได้) **ต้องเปิด permission ของ Accounts API ให้ TikTok app แล้ว re-authorize ก่อน** ไม่งั้นได้ 502 พร้อม error จริงจาก TikTok — ดูคอมเมนต์หัวไฟล์ route |
| 3a | `/api/tiktok/sync-windsor` | POST | ทุก 24 ชั่วโมง | **ตัวที่ใช้งานจริงอยู่ตอนนี้** — organic ผ่าน Windsor.ai (profile views, followers, ยอดรายคลิป) เขียนตารางเดียวกับ #3 เป๊ะ ต้องมี `WINDSOR_API_KEY` + `TIKTOK_BUSINESS_ID` ใน env ดึงย้อนหลังได้สูงสุด `?date_preset=last_90d` (ค่า default) วัน TikTok อนุมัติ Accounts API ให้เปลี่ยนไปใช้ #3 แทนแล้วปิดตัวนี้ ไม่ต้องแก้โค้ด |
| 3b | `/api/tiktok/sync-profile` | POST | — (เลิกใช้) | ตัวเก่าของ #3 ต้องตั้ง `TIKTOK_BUSINESS_ID` เอง ได้แค่ snapshot followers/likes/videos ไม่มี profile views เก็บไว้จนกว่า #3 จะยืนยันว่าใช้ได้จริงกับ account จริง แล้วค่อยลบ |
| 4 | `/api/tiktok/check-token-expiry` | POST | ทุก 1 ชั่วโมง (AC2/AC3) | alert "refresh token ใกล้หมดอายุ" (F04) + proactive refresh access token ก่อนหมดอายุ (F03) — เดิมทั้งคู่ผูกอยู่กับรอบ sync 24h เท่านั้น endpoint นี้แยกออกมาให้เช็ค/refresh ได้ถี่กว่า โดยไม่ต้องรอ sync ใหญ่ |

## ตัวอย่าง n8n HTTP Request node

```
Method: POST
URL: https://<your-domain>/api/tiktok/sync
Headers:
  Authorization: Bearer {{$env.SYNC_TRIGGER_SECRET}}
```

ตั้ง `?source=n8n` ต่อท้าย URL ได้ (เช่น `/api/tiktok/sync?source=n8n`) เพื่อให้ `tiktok_sync_log.triggered_by` แยกความต่างจากการกดปุ่มเองในเว็บ (`manual`) — ไม่บังคับ ถ้าไม่ใส่ระบบ detect เป็น `n8n` ให้อัตโนมัติอยู่แล้วเมื่อเรียกผ่าน secret

## ข้อควรรู้

- **Concurrent-sync lock (EC8):** ถ้า endpoint #1 ถูกเรียกซ้อนกัน (n8n retry, หรือมีคนกด "Sync Data" พร้อมกัน) ตัวที่มาทีหลังจะได้ `409 Sync กำลังดำเนินการอยู่` กลับไปทันที ไม่ใช่ error — n8n ไม่ต้อง retry เคสนี้
- **Storage-pause (EC12):** ถ้า sync ถูกพักไว้เพราะ storage เต็ม จะได้ `503` กลับมา พร้อมเหตุผลใน `error` — ต้องให้ admin ไปปลดล็อกที่ตาราง `tiktok_sync_control` (ไม่ auto-resume)
- ตัวเลขรอบ (24h/12h/1h) มาจาก TOR ตรง ๆ — ถ้า TOR ฉบับใหม่ระบุรอบต่าง (เช่น acceptance criteria บางข้อพูดถึง "ทุก 6h") ให้ปรับรอบใน n8n เอาเอง โค้ดฝั่ง endpoint ไม่ผูกกับรอบเวลาที่แน่นอน เรียกถี่แค่ไหนก็ทำงานถูกต้อง (ไม่ duplicate ข้อมูล เพราะเป็น upsert แบบ incremental — F09)
