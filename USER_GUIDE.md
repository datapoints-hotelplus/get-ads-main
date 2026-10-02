# 📖 คู่มือใช้งาน Admin Panel
## HOTEL PLUS — เรียนรู้ง่ายๆ

---

# 🚀 เริ่มต้นใช้งาน

## ขั้นตอนที่ 1: เข้าสู่ระบบ

1. เปิด URL: `/admin/login`
2. ใส่ **Username** ของคุณ (ตัวอย่าง: `admin`)
3. ใส่ **Password** ของคุณ
4. กด **เข้าสู่ระบบ**

```
┌──────────────────────────────────────┐
│    Admin Login                       │
│                                      │
│  Username: [admin___________]        │
│  Password: [••••••________]          │
│                                      │
│          [เข้าสู่ระบบ]               │
└──────────────────────────────────────┘
```

✅ ถ้า login สำเร็จ → ไปหน้า Admin หลัก  
❌ ถ้า login ไม่ได้ → ตรวจสอบ username/password

---

# 📁 หน้า 1: จัดการ Account (Manage Accounts)

**URL**: `/admin`

นี่คือหน้าแรกของ Admin Panel ใช้สำหรับจัดการ Ad Account ของคุณ

## ✨ สิ่งที่คุณสามารถทำได้:
- ➕ เพิ่ม Ad Account ใหม่
- ✏️ เปิด-ปิด Account
- 🗑️ ลบ Account
- 🔄 ดึงข้อมูล Account จาก Facebook

---

## 📝 วิธีเพิ่ม Account ใหม่

### ขั้นตอน:

**Step 1** — ค้นหาชื่อ Account
- ชื่อที่คุณจะเห็นใน Dashboard (เช่น "Business Page 1", "My Store")

**Step 2** — ค้นหา Account ID
- ไป Facebook Ads Manager → Settings → Account Details
- คัดลอก ID (ตัวเลข 15 หลัก เช่น `act_123456789012345`)

**Step 3** — กรอก Form
```
┌──────────────────────────────────────────┐
│ Add Account                              │
├──────────────────────────────────────────┤
│ Account Name:                            │
│ [My Business Page_____________]          │
│                                          │
│ Account ID:                              │
│ [act_123456789012345________]            │
│                                          │
│                   [Add Account]          │
└──────────────────────────────────────────┘
```

**Step 4** — กด **Add Account**

✅ สำเร็จ → Account ปรากฏในตารางด้านล่าง

---

## 📊 ตารางแสดง Account

ตารางนี้แสดง Account ทั้งหมด

```
┌─────────────────────────────────────────────────┐
│ Accounts                                   (3) │
├─────────────────────────────────────────────────┤
│ # │ Account Name      │ ID        │ Status    │
├─────────────────────────────────────────────────┤
│ 1 │ My Business Page  │ act_123.. │ ✅ Active │
│ 2 │ My Store          │ act_456.. │ ✅ Active │
│ 3 │ Test Account      │ act_789.. │ ❌ Off    │
└─────────────────────────────────────────────────┘
```

### การใช้งาน:

**เปลี่ยน Status (Active/Off)**
- กด Badge สีเขียวหรือแดง เพื่อเปลี่ยนสถานะ
- ✅ Active = Account เปิดใช้งาน
- ❌ Off = Account ปิดใช้งาน

**ลบ Account**
- กด **Delete** ที่ด้านขวา
- ⚠️ ลบแล้วกู้คืนไม่ได้

---

## 🔄 ดึงข้อมูลจาก Facebook

ปุ่ม **Fetch from Facebook** ที่ด้านบนขวา

**ใช้เมื่อ**: 
- เพิ่ม Account ใหม่แล้วอยากให้ชื่อตรงกับ Facebook

**วิธีใช้**:
1. กด **Fetch from Facebook**
2. Confirm: "ดึงข้อมูล Account จาก Facebook ใช่ไหม?"
3. รอสักครู่ (มี "กำลังดึงข้อมูล...")
4. ✅ สำเร็จ → ชื่อ Account อัปเดตอัตโนมัติ

---

# 👥 หน้า 2: จัดการ User (Manage Users)

**URL**: `/admin/users`

หน้านี้ใช้สำหรับ:
- ➕ สร้าง user ใหม่ (คนที่จะใช้ Dashboard)
- 🔐 เปลี่ยนรหัสผ่าน user
- 🔑 กำหนดว่า user เห็น Account ไหนบ้าง
- 🚫 ปิดการใช้งาน user
- 🗑️ ลบ user
- 📋 ดูประวัติการเข้าใช้งาน

---

## ➕ วิธีสร้าง User ใหม่

**Form**:
```
┌──────────────────────────────────────────┐
│ Create New User                          │
├──────────────────────────────────────────┤
│ Username *  │ Password *  │ Display Name │
│ [john_doe]  │ [••••••]    │ [John Doe]   │
│                                          │
│                      [Create User]       │
└──────────────────────────────────────────┘
```

**Step-by-step**:

1. **Username**: ชื่อสำหรับ login (ภาษาอังกฤษ ตัวเล็ก เช่น `john_doe`)
2. **Password**: รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)
3. **Display Name**: ชื่อเต็มที่จะแสดง (เช่น "John Doe") — ไม่บังคับ
4. กด **Create User**

✅ สำเร็จ → User ปรากฏในตารางด้านล่าง

---

## 📊 ตารางแสดง User

```
┌─────────────────────────────────────────────────┐
│ Users                                      (5) │
├─────────────────────────────────────────────────┤
│ Username  │ Display Name   │ Status  │ Created │
├─────────────────────────────────────────────────┤
│ admin     │ Admin User     │ ✅ On   │ 15 ก.ค. │
│ john_doe  │ John Doe       │ ✅ On   │ 14 ก.ค. │
│ jane_smith│ Jane Smith     │ ❌ Off  │ 13 ก.ค. │
└─────────────────────────────────────────────────┘
```

---

## 🔐 Actions (ปุ่มต่างๆ)

### 1️⃣ Pages — กำหนดสิทธิ์การเห็น Account

**ที่สำคัญที่สุด!** ❗

หากไม่ทำขั้นตอนนี้ → user จะไม่เห็นข้อมูลเลย

**วิธีใช้**:
1. กด **Pages** ข้าง user
2. ติ๊กเลือก Account ที่ user นี้ควรเห็น

```
┌──────────────────────────────────────────┐
│ Permissions — john_doe                   │
├──────────────────────────────────────────┤
│ ☐ My Business Page (act_123...)          │
│ ☑ My Store (act_456...)                  │
│ ☑ Test Account (act_789...)              │
│                                          │
│  [Save Permissions]  [Cancel]            │
└──────────────────────────────────────────┘
```

3. กด **Save Permissions**

✅ เสร็จแล้ว → user สามารถเห็น Account ที่เลือก

---

### 2️⃣ Reset pwd — เปลี่ยนรหัสผ่าน

**ใช้เมื่อ**: user ลืมรหัสผ่าน หรือต้องการเปลี่ยน

**วิธี**:
1. กด **Reset pwd** ข้าง user
2. ใส่รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)
3. กด **Set**

```
[New password] [Set] [Cancel]
```

✅ เสร็จแล้ว → user ใช้รหัสผ่านใหม่ได้

---

### 3️⃣ Logs — ดูประวัติการเข้าใช้

**ใช้เมื่อ**: ต้องการตรวจสอบว่า user เข้าใช้บ่อยไหม

```
┌──────────────────────────────────────────┐
│ Access Logs                              │
├──────────────────────────────────────────┤
│ Time             │ Username │ Page      │
├──────────────────────────────────────────┤
│ 15/06 10:30     │ john_doe │ /dashboard│
│ 15/06 09:15     │ john_doe │ /admin    │
│ 14/06 14:45     │ john_doe │ /dashboard│
└──────────────────────────────────────────┘
```

---

### 4️⃣ Delete — ลบ user

⚠️ **ลบแล้วกู้คืนไม่ได้**

1. กด **Delete**
2. Confirm: "ลบ user ใช่ไหม?"
3. User ถูกลบออก

---

### 5️⃣ Status Toggle — เปิด/ปิด user

- ✅ **On** = user สามารถ login ได้
- ❌ **Off** = user ไม่สามารถ login ได้ (ไม่ต้องลบ)

กด Badge เพื่อเปลี่ยน

---

# ⭐ หน้า 3: Highlight Metrics

**URL**: `/admin/highlights`

หน้านี้ใช้สำหรับ:
- ⭐ เลือก metric ที่สำคัญสำหรับแต่ละ campaign
- เมื่อ user เลือก campaign ใน Dashboard → จะ highlight metric ที่เลือก

---

## 🎯 วิธีใช้งาน

**ตัวอย่าง**:
```
┌────────────────────────────────────────┐
│ Summer Campaign 2026                   │
│              [ใช้ทั้งหมด] [บันทึก]     │
├────────────────────────────────────────┤
│ [Impressions] [Clicks]  [Spend]        │
│ [CTR]         [Reach]   [Messages]     │
└────────────────────────────────────────┘
```

### Step:

1. **ค้นหา Campaign** ที่ต้องการ
   - ใช้ search box ด้านบน

2. **กดเลือก Metric**
   - ปุ่มจะเปลี่ยนเป็นสีน้ำเงิน = เลือกแล้ว

3. **กด บันทึก**
   - บันทึก metric ที่เลือก

### หรือ:

**ใช้กับทั้งหมด** — คัดลอก metric ไปให้ทุก campaign
- กด "ใช้กับทั้งหมด"
- Metric ของ campaign นี้ → คัดลอกไปทั้งหมด

---

## 📊 Metric ที่มี

```
Impressions         Clicks           Reach
CPM                 CPC              CTR
Messages Started    Cost per Message Frequency
Unique Clicks       Post Engagement  Page Likes
Post Shares         Leads            Cost per Lead
Cost / Engagement   Cost / Like      (และอื่นๆ)
```

---

# 🔄 หน้า 4: Sync Panel

**URL**: `/admin/sync`

หน้านี้ใช้สำหรับ **ดึงข้อมูลจาก Facebook มาบันทึกใน System**

---

## 🔘 ปุ่มต่างๆ

### 1️⃣ Get All Page
- **ใช้**: เมื่อเพิ่ม Account ใหม่
- **ทำ**: ดึงข้อมูล Account แล้วบันทึก
- ⏱️ เวลา: ⚡ เร็ว (< 1 นาที)

### 2️⃣ Backfill (12 เดือนย้อนหลัง)
- **ใช้**: เมื่อเริ่มต้นระบบ หรือต้องการข้อมูลเก่า
- **ทำ**: ดึงข้อมูล 12 เดือนที่ผ่านมา
- ⏱️ เวลา: ⏳ นาน (5-15 นาที)

### 3️⃣ ดึงข้อมูลวันนี้
- **ใช้**: ดึงข้อมูลวันปัจจุบัน
- **ทำ**: ดึง 00:00 → ตอนนี้ ของวันนี้
- ⏱️ เวลา: ⚡ เร็ว (< 1 นาที)

### 4️⃣ อัปเดตข้อมูลให้เป็นล่าสุด
- **ใช้**: ดึงข้อมูลให้ newest
- **ทำ**: เช็ควันล่าสุด → ดึงตั้งแต่นั้นถึงวันนี้
- ⏱️ เวลา: ⚡ เร็ว (< 1 นาที)

### 5️⃣ Resync (Smart Update)
- **ใช้**: อัปเดตข้อมูลอย่าง smart
- **ทำ**: ดึงทั้งหมด แต่อัพเดตเฉพาะแถวที่เปลี่ยน
- ⏱️ เวลา: 🟡 ปานกลาง (2-5 นาที)

### 6️⃣ Backfill TikTok
- **ใช้**: ดึงข้อมูล TikTok Ads
- **ทำ**: ดึง 365 วัน
- ⏱️ เวลา: ⏳ นาน (5-15 นาที)
- **ต้อง**: Advertiser ID ต้อง set ไปแล้ว

### 7️⃣ ลบข้อมูล
- **ใช้**: ลบข้อมูลบาง table บาง วันที่
- **ทำ**: 
  1. ติ๊กเลือก table (ads_rawdata, ads_geo, ...)
  2. เลือกวันที่ (optional)
  3. กด "ลบข้อมูล"
- ⚠️ **ลบแล้วกู้คืนไม่ได้**

---

## 💡 ควรรันเมื่อไหร่

| ปุ่ม | ความบ่อย | เมื่อไหร่ |
|-----|---------|---------|
| Get All Page | 1 ครั้ง | เมื่อเพิ่ม Account |
| Backfill | 1 ครั้ง | เมื่อเริ่มต้นระบบ |
| ดึงวันนี้ | ทุกวัน | เช้า (cron job) |
| อัปเดตล่าสุด | ทุกวัน | เช้า (cron job) |
| Resync | 1 ครั้งต่อสัปดาห์ | สัปดาห์ละครั้ง |
| TikTok | ทุกวัน | เช้า (cron job) |

---

# ⚙️ หน้า 5: Config

**URL**: `/admin/config`

หน้านี้แสดง **สถานะของระบบ**

```
┌──────────────────────────────────────────┐
│ Facebook Access Token                    │
├──────────────────────────────────────────┤
│ Token: xxxxxxxxxxxxxxx...                │
│ Status: ✅ Database (auto-refresh)       │
│ Refresh: 15 มิ.ย. 2026, 10:30            │
│ Expire:  22 มิ.ย. 2026 (อีก 7 วัน) ⚠️   │
│                                          │
│                  [🔄 Refresh ตอนนี้]     │
├──────────────────────────────────────────┤
│ Data Status                              │
│ Latest Date: 15 มิ.ย. 2026 (วันนี้)      │
│ Total Rows: 1,234,567 แถว                │
└──────────────────────────────────────────┘
```

---

## 🔐 FB Token Status

**ดูว่า Token หมดอายุไหม**

- ✅ Green: OK
- ⚠️ Orange: เตือน (ใกล้หมดอายุ)
- ❌ Red: หมดอายุแล้ว

**ถ้า ⚠️ หรือ ❌ → กด Refresh ตอนนี้**

---

## 📊 Data Status

- **Latest Date**: วันที่ล่าสุดของข้อมูลใน system
- **Total Rows**: จำนวนแถวข้อมูลทั้งหมด

---

# 📖 หน้า 6: วิธีใช้ (Docs)

**URL**: `/admin/docs`

หน้านี้มี **tutorial ครบถ้วน** สำหรับการใช้งาน

### Sections:
1. ภาพรวมระบบ
2. ระบบ Login
3. จัดการ Accounts
4. จัดการ Users
5. กำหนดสิทธิ์
6. Highlight Metrics
7. Dashboard (สำหรับ user)
8. กราฟวิเคราะห์
9. Sync Panel
10. แก้ปัญหาที่พบบ่อย

---

# 🎯 TikTok — ตั้งค่า Advertiser ID

**URL**: `/admin/tiktok-advertiser-ids`

ต้อง **set Advertiser ID** จาก TikTok Ads Manager ก่อนจึงจะใช้ได้

```
┌──────────────────────────────────────────┐
│ Manage TikTok Advertiser IDs             │
├──────────────────────────────────────────┤
│ Account       │ User ID  │ Advertiser ID │
├──────────────────────────────────────────┤
│ @my_account   │ 102938.. │ [1234567    ] │
│               │          │ ✓ Ready       │
│               │          │  [Save]       │
├──────────────────────────────────────────┤
│ @shop_page    │ 384758.. │ [          ] │
│               │          │ ⚠️ Not Set    │
│               │          │  [Save]       │
└──────────────────────────────────────────┘
```

---

## 📝 วิธีหา Advertiser ID

1. ไป **TikTok Ads Manager** (https://ads.tiktok.com)
2. ไป **Settings → Business Details**
3. หาค่า **Advertiser Account ID** (หรือ Business ID)
4. มันเป็นตัวเลข 6-8 หลัก (เช่น `1234567`)
5. คัดลอกแล้ว paste ลงในช่อง
6. กด **Save**

---

# 🚨 TikTok Error Page

**URL**: `/admin/tiktok-error`

ถ้า connect TikTok ไม่ได้ → จะมาหน้านี้

```
┌──────────────────────────────────────────┐
│ ⚠️ Connection Failed                     │
│ We couldn't connect your TikTok account  │
│                                          │
│ Error: missing_code                      │
│ Authorization code was not provided      │
│                                          │
│ Try:                                     │
│ ✓ Check TikTok credentials              │
│ ✓ Ensure TIKTOK_CLIENT_ID is set        │
│ ✓ Try again in a few moments            │
│                                          │
│  [Try Again]  [Back to Tokens]           │
└──────────────────────────────────────────┘
```

---

# 📌 Header Menu — ปุ่มบนสุด

ที่ด้านบนของทุกหน้า Admin

```
┌──────────────────────────────────────────┐
│ [H+] HOTEL PLUS Admin                    │
│ Subtitle                                 │
│                                          │
│ [Manage Users] [Highlights] [Sync Panel] │
│ [⚙️ Config] [📖 วิธีใช้] [Logout]        │
└──────────────────────────────────────────┘
```

**Buttons**:
- **Manage Users** → `/admin/users`
- **Highlights** → `/admin/highlights`
- **Sync Panel** → `/admin/sync`
- **⚙️ Config** → `/admin/config`
- **📖 วิธีใช้** → `/admin/docs`
- **Logout** → ออกจากระบบ

---

# 🔐 Security Tips

1. **รหัสผ่าน**: ใช้รหัสที่แข็งแรง (มี ตัวอักษร + ตัวเลข)
2. **Session**: Session expire ใน 7 วัน → ต้อง login ใหม่
3. **Permissions**: ต้องกำหนดสิทธิ์ให้ user ไม่อย่างไร user จะไม่เห็นข้อมูล
4. **Delete**: ลบแล้วไม่สามารถกู้ได้ → ต้องระวัง
5. **Logout**: ปิด session เสมอตอนจบการใช้งาน

---

# ❓ Q&A — คำถามทั่วไป

### Q: User login แล้วไม่เห็นข้อมูล
**A**: ไปหน้า Manage Users → กด Pages → assign Account ให้ user

### Q: ลืมรหัสผ่าน
**A**: ไปหน้า Manage Users → กด Reset pwd ข้าง user

### Q: Account ไม่ทำงาน
**A**: ตรวจสอบ:
- Account ID ถูกต้องไหม (จาก Facebook)
- Account เปิด (Active) ไหม
- ได้ข้อมูลจาก Sync Panel ไหม

### Q: Sync กำลังทำงาน นานไหม?
**A**: 
- Get All Page: < 1 นาที
- ดึงวันนี้: < 1 นาที
- Backfill: 5-15 นาที
- Resync: 2-5 นาที

### Q: ต้อง Sync บ่อยไหม?
**A**: ควร sync ทุกวันเช้า (ตั้ง cron job)

### Q: ต้อง Backfill ทุกครั้งไหม?
**A**: ไม่ต้อง → ทำแค่ครั้งแรกเมื่อเริ่มต้นระบบ

### Q: ลบข้อมูลแล้วกู้คืนได้ไหม?
**A**: ไม่ได้ → ต้องระวังตอนลบ

### Q: Token หมดอายุ ต้องทำไง?
**A**: ไปหน้า Config → กด "Refresh ตอนนี้"

---

# 📞 ติดต่อ Support

- **Email**: admin@example.com
- **Phone**: 02-XXX-XXXX
- **Line**: @hotelplus_support

---

**Document Version**: 1.0  
**Update**: 2026-06-15  
**For**: HOTEL PLUS Admin Users
