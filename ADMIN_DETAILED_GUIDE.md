# Admin Panel — คู่มือการใช้งานแบบละเอียด
## ด้วยชื่อเมนู ปุ่ม และอธิบาย step-by-step

---

# 📊 Menu Structure — โครงสร้างเมนูหลัก

```
┌─────────────────────────────────────────────────────────────┐
│  HOTEL PLUS Admin — Header Navigation Bar                  │
├─────────────────────────────────────────────────────────────┤
│  [H+] HOTEL PLUS                                             │
│                                                              │
│  Left Side:                   Right Side:                   │
│  • Admin Title                • [Manage Users]              │
│  • Subtitle                   • [Highlight Metrics]         │
│                              • [Sync Panel]                 │
│                              • [⚙️ Config]                  │
│                              • [📖 วิธีใช้]                 │
│                              • [Logout]                     │
└─────────────────────────────────────────────────────────────┘
```

---

# 1️⃣ MAIN ADMIN PAGE `/admin`
## จัดการ Ad Accounts

```
┌─────────────────────────────────────────────────────────────┐
│  HOTEL PLUS                      Manage Users  Sync Panel    │
│  Admin — Manage Accounts         Config  วิธีใช้  Logout    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Add Account                                            │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Account Name *                                         │ │
│  │ [__________________]  My Business Page                │ │
│  │                                                        │ │
│  │ Account ID *                                           │ │
│  │ [__________________]  act_123456789 or 123456789      │ │
│  │                                                        │ │
│  │                           [Add Account]               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Accounts                                          (3) │ │
│  │ ┌─────────────────────────────────────────────────────┤ │
│  │ [Sync icon] Fetch from Facebook  [Status]              │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │ #  Account Name      Account ID        Status  Action  │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │ 1  Business Page 1   act_123456      [Active]  Delete  │ │
│  │ 2  Business Page 2   act_789012      [Active]  Delete  │ │
│  │ 3  My Store          act_345678    [Inactive]  Delete  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 📝 Form: Add Account

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **Account Name** | Text Input | ✅ Yes | ชื่อที่จะแสดงใน dashboard (เช่น "Business Page 1") |
| **Account ID** | Text Input | ✅ Yes | ID จาก Facebook Ads (เช่น `act_123456789` หรือ `123456789`) |

**Button: Add Account**
- สี: สีเขียว (secondary color)
- ทำงาน: POST `/api/admin/accounts` → ล้างฟอร์ม → โหลด account ใหม่
- State Loading: "Adding…" → "Add Account"

---

## 📊 Table: Accounts

### Column 1: # (Index)
- ลำดับที่ (1, 2, 3, ...)
- ไม่สามารถกด

### Column 2: Account Name
- ชื่อ account ที่กำหนด
- Font: Bold

### Column 3: Account ID
- ID จาก Facebook
- Font: Monospace (code style)
- สี: Gray

### Column 4: Status Badge
- **สีเขียว**: Active — account กำลังทำงาน
- **สีแดง**: Inactive — account ปิดการใช้งาน
- **กด**: Toggle เปลี่ยนสถานะ
- Text: "Active" / "Inactive"
- Loading State: "…"

### Column 5: Action
- **Delete** button
- สี: Red
- ลบออกจากระบบ (ไม่มี confirm!)
- Loading State: "Deleting…" → "Delete"
- ⚠️ **ลบแล้วกู้คืนไม่ได้**

---

## 🔘 Header Button: Fetch from Facebook

**ตำแหน่ง**: ด้านบนขวาของตาราง Accounts

```
┌──────────────────────────┐
│ [Sync icon] Fetch from   │
│     Facebook             │
└──────────────────────────┘
```

**ฟังก์ชั่น**: 
- ดึง Ad Account ทั้งหมดจาก Facebook API
- ดึงชื่อมาอัปเดต

**ขั้นตอน**:
1. คลิก "Fetch from Facebook"
2. Confirm: "ดึงข้อมูล Ad Account จาก Facebook และอัปเดตชื่อในระบบ?"
3. Wait: "กำลังดึงข้อมูล…"
4. Success: "ดึงข้อมูลสำเร็จ 5 บัญชี" (green message)
5. Account list update อัตโนมัติ

**Response Message**:
- สี: Green
- Text: "ดึงข้อมูลสำเร็จ [จำนวน] บัญชี"

---

## 💾 State ของ Main Admin Page

```tsx
accounts[] = [              // รายชื่อ account
  {
    account_name: string,
    account_id: string,
    is_active: boolean
  }
]

addError = ""               // Error message เมื่อ Add
addLoading = false          // Loading state เมื่อ Add
deleteLoading = null        // account_id ที่กำลังลบ
toggleLoading = null        // account_id ที่กำลังเปลี่ยน
fetchLoading = false        // Fetch from Facebook loading
fetchMessage = {
  type: "success|error",
  text: string
}
```

---

# 2️⃣ CONFIG PAGE `/admin/config`
## ตรวจสอบสถานะการ Config

```
┌─────────────────────────────────────────────────────────────┐
│  System Config                        ← กลับหน้า Admin     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Facebook Access Token              [🔄 Refresh ตอนนี้]│  │
│  ├──────────────────────────────────────────────────────┤   │
│  │ Token (masked)                    xxxxxxxxxxxxxxx...  │   │
│  │                                                       │   │
│  │ แหล่งที่มา               ● Database (auto-refresh...)│   │
│  │ Refresh ล่าสุด           15 มิ.ย. 2026, 10:30       │   │
│  │ หมดอายุ                  22 มิ.ย. 2026, 10:30 (7 วัน)│  │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ads_rawdata                                          │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ วันที่ล่าสุดของข้อมูล     15 มิ.ย. 2026 (วันนี้)     │   │
│  │ จำนวนแถวทั้งหมด         1,234,567 แถว             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Section 1: Facebook Access Token

### Row 1: Token (masked)
**Label**: "Token (masked)"  
**Value**: 
- `xxxxxxxxxxxxxxx...` (ปิดบังเพื่อความปลอดภัย)
- สี: Monospace font
- หรือ ❌ "ไม่มี token" (red) ถ้าไม่มี

### Row 2: แหล่งที่มา
**Label**: "แหล่งที่มา"  
**Value**: 3 สถานะ
```
● (Green)  Database (auto-refresh ทำงาน)
● (Orange) .env (ยังไม่เคย refresh)
● (Red)    ไม่พบ
```

### Row 3: Refresh ล่าสุด
**Label**: "Refresh ล่าสุด"  
**Value**: 
- `15 มิ.ย. 2026, 10:30` (Thai format)
- ข้างหลัง: `(วันนี้)` / `(เมื่อวาน)` / `(5 วันที่แล้ว)`

### Row 4: หมดอายุ
**Label**: "หมดอายุ"  
**Value**: 
- `22 มิ.ย. 2026, 10:30`
- ข้างหลัง: 
  - ❌ `(หมดอายุแล้ว)` — red
  - ⚠️ `(อีก 3 วัน)` — red (≤ 7 วัน)
  - ✅ `(อีก 20 วัน)` — green (> 7 วัน)

---

## 🔘 Button: Refresh ตอนนี้

**ตำแหน่ง**: ด้านขวา header

```
┌──────────────────┐
│ 🔄 Refresh ตอนนี้ │
└──────────────────┘
```

**สี**: Blue (bg-blue-600)

**ฟังก์ชั่น**:
1. POST `/api/admin/config`
2. Refresh Facebook Access Token

**Loading State**: "กำลัง refresh…"

**Success Message**:
```
✅ Refresh สำเร็จ — token ใหม่: xxxxxxx... (อายุ 60 วัน)
```

---

## 📊 Section 2: ads_rawdata

### Row 1: วันที่ล่าสุดของข้อมูล
**Value**: 
- `15 มิ.ย. 2026` (date only)
- ข้างหลัง: `(วันนี้)` / `(เมื่อวาน)` / `(5 วันที่แล้ว)`
- หรือ ❌ "ไม่มีข้อมูล" (red)

### Row 2: จำนวนแถวทั้งหมด
**Value**: 
- `1,234,567 แถว` (formatted with comma)
- Locale: Thai (th-TH)

---

# 3️⃣ USERS PAGE `/admin/users`
## จัดการ User

```
┌─────────────────────────────────────────────────────────────┐
│  HOTEL PLUS                          ← Accounts  Logout     │
│  Admin — Manage Users                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Create New User                                        │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Username *         Password *       Display Name       │ │
│  │ [john_doe]         [••••••]         [John Doe]         │ │
│  │                                                        │ │
│  │                           [Create User]               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Users                                            (5) │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ #  Username      Display Name    Status   Created    │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 1  admin         Admin User       Active   15/06/2026│ │
│  │ 2  john_doe      John Doe        Active   14/06/2026│ │
│  │                  Actions: [Pages] [Reset pwd] [Logs]│ │
│  │                           [Delete]                  │ │
│  │                                                      │ │
│  │ 3  jane_smith    Jane Smith       Active   13/06/2026│ │
│  │    ...                                              │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Form: Create New User

| Field | Type | Required | Min Length | Description |
|-------|------|----------|-----------|-------------|
| **Username** | Text | ✅ Yes | - | ภาษาอังกฤษ ตัวเล็ก (john_doe) |
| **Password** | Text | ✅ Yes | 6 | "Min 6 characters" |
| **Display Name** | Text | ❌ No | - | ชื่อที่จะแสดง (John Doe) |

**Button: Create User**
- สี: Green (secondary)
- Loading: "Creating…"

---

## 📊 Table: Users

### Column 1: #
- ลำดับที่

### Column 2: Username
- ชื่อที่ login
- Font: Monospace

### Column 3: Display Name
- ชื่อแสดง (หรือ "—" ถ้าไม่มี)

### Column 4: Status Badge
- **Active** (green) / **Disabled** (red)
- คลิกเพื่อ toggle

### Column 5: Created
- วันที่สร้าง
- Format: "15/06/2026 10:30" (Thai locale)
- Font: Small, Gray

### Column 6: Actions (5 buttons)

#### Button 1: Pages
- สี: Secondary blue
- ฟังก์ชั่น: เปิด permissions panel

#### Button 2: Reset pwd
- สี: Yellow
- ฟังก์ชั่น: สลับเป็น inline password form

**Inline Form** (สลับมาเมื่อกด Reset pwd):
```
[New password (6+ chars)] [Set] [Cancel]  [Error message]
```

#### Button 3: Logs
- สี: Gray
- ฟังก์ชั่น: ดู access logs ของ user

#### Button 4: Delete
- สี: Red
- ฟังก์ชั่น: ลบ user (ต้อง confirm)
- ⚠️ ลบแล้วกู้คืนไม่ได้

---

## 🔐 Permissions Panel

**ปรากฏเมื่อ**: กด "Pages" ข้าง user

```
┌─────────────────────────────────────────────────────────────┐
│  HOTEL PLUS                    ← Back to Users              │
│  Permissions — john_doe                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User: john_doe                                              │
│  Check the ad accounts this user is allowed to view        │
│  on the dashboard.                                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ☐ Business Page 1                                   │   │
│  │    act_123456789                                    │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ ☑ Business Page 2                                   │   │
│  │    act_789012345                                    │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ ☑ My Store                                           │   │
│  │    act_345678901                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Save Permissions]  [Cancel]                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Checkbox List**:
- ☐/☑ Account Name
- account_id (gray, small, monospace)
- คลิกเลือก/ยกเลิก

**Buttons**:
- **Save Permissions**: Green button → PUT `/api/admin/users/{id}/permissions`
- **Cancel**: Gray text button → กลับไป Users view

---

## 📋 Access Logs View

**ปรากฏเมื่อ**: กด "Logs" ข้าง user (หรือ "View All Logs" ด้านบน)

```
┌─────────────────────────────────────────────────────────────┐
│  Access Logs                                    Show all    │
│                                                (if filtered) │
├─────────────────────────────────────────────────────────────┤
│ Time                    Username     Page          IP       │
├─────────────────────────────────────────────────────────────┤
│ 15/06/2026 10:30       admin        /admin/users  192.1... │
│ 15/06/2026 09:45       john_doe     /dashboard    203.0... │
│ 14/06/2026 14:22       jane_smith   /admin/users  —        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Columns**:
- **Time**: "15/06/2026 10:30" (Thai format, small, gray)
- **Username**: monospace, small
- **Page**: หน้าที่เข้า (เช่น `/admin/users`)
- **IP Address**: "192.168..." หรือ "—"

---

# 4️⃣ HIGHLIGHT METRICS PAGE `/admin/highlights`
## กำหนด Highlight Metric แต่ละ Campaign

```
┌─────────────────────────────────────────────────────────────┐
│  HOTEL PLUS                        ← Accounts               │
│  Highlight Metrics                                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [🔍 ค้นหา Campaign...]                                     │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Summer Campaign 2026                                  │ │
│  │                    [ใช้กับทุก Campaign] [บันทึก]      │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ [Messages Started]  [Cost per Message]  [CTR]          │ │
│  │ [Link Clicks]       [Amount Spent]      [Frequency]    │ │
│  │ [Impressions]       [Unique Link Clicks][Reach]        │ │
│  │ [CPM]               [Leads]             [Cost per Lead]│ │
│  │ [Post Shares]       [Page Likes]        [Post Engagement]
│  │ [Cost / Engagement] [Cost / Like]                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Autumn Campaign 2026                                  │ │
│  │                    [ใช้กับทุก Campaign] [บันทึก]      │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ [Messages Started]  [Cost per Message]  [CTR]          │ │
│  │   ...                                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 Search Box
**Placeholder**: "ค้นหา Campaign..."  
**ฟังก์ชั่น**: Filter campaign แบบ case-insensitive

---

## 📌 Campaign Card Structure

### Header
- **Campaign Name** (ชื่อ campaign)
- **Right Buttons**:
  - "ใช้กับทุก Campaign" (gray, border)
  - "บันทึก" (green button)

### Metrics Grid
**24 metric buttons** (toggle style):

```
Colors:
☐ White background, gray text, gray border → Not selected
☑ Blue background, black text, blue border → Selected (active)
```

**Metric List**:
1. Messages Started
2. Cost per Message
3. CTR
4. Link Clicks
5. Amount Spent
6. Frequency
7. Impressions
8. Unique Link Clicks
9. Reach
10. CPM
11. Leads
12. Cost per Lead
13. Post Shares
14. Page Likes
15. Post Engagement
16. Cost / Engagement
17. Cost / Like
(+ 7 more)

**On Click**:
- Toggle color (blue ↔ white)
- Add/Remove from `highlights[campaign][]`

**Buttons**:
1. "ใช้กับทุก Campaign"
   - Copy metrics จาก campaign นี้ → ไปให้ทุก campaign
   - PUT `/api/admin/highlights` × N campaigns

2. "บันทึก"
   - PUT `/api/admin/highlights` สำหรับ campaign นี้เท่านั้น

---

# 5️⃣ SYNC PANEL PAGE `/admin/sync`
## ดึงข้อมูล & Sync Database

```
┌─────────────────────────────────────────────────────────────┐
│  HOTEL PLUS                Manage Accounts  Highlight      │
│  Admin — Sync Panel        Manage Users  วิธีใช้  Logout   │
├─────────────────────────────────────────────────────────────┤
│ Sync Panel                                                  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. Get All Page → Supabase "allpage"                  │ │
│  │ ดึงข้อมูล account จาก rawdata แล้วบันทึกลงตาราง    │ │
│  │                           [Get All Page]              │ │
│  │ Success: ✅ บันทึกสำเร็จ 3 accounts                  │ │
│  │          • Business Page 1 (act_123456)              │ │
│  │          • Business Page 2 (act_789012)              │ │
│  │          • My Store (act_345678)                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 2. Backfill (12 เดือนย้อนหลัง)                        │ │
│  │ ดึงข้อมูลรายวันย้อนหลัง 12 เดือน เฉพาะแถวที่         │ │
│  │ spend > 0                                              │ │
│  │                           [เริ่ม Backfill]            │ │
│  │ Loading: "กำลัง Backfill…"                            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 3. ดึงข้อมูลวันนี้                                      │ │
│  │ ดึงข้อมูลตั้งแต่ 00:00 ถึงตอนนี้ของวันปัจจุบัน         │ │
│  │                           [ดึงข้อมูลวันนี้]            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 4. อัปเดตข้อมูลให้เป็นล่าสุด                           │ │
│  │ เช็ควันที่ล่าสุดในฐานข้อมูล แล้วดึงข้อมูล              │ │
│  │ ตั้งแต่วันนั้นถึงวันนี้                                │ │
│  │                           [อัปเดตข้อมูล]              │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 5. Resync (Smart Update)                              │ │
│  │ ดึงข้อมูลตั้งแต่วันแรกถึงวันนี้ · เปรียบเทียบ Hash    │ │
│  │ Update เฉพาะแถวที่เปลี่ยน                             │ │
│  │                           [Resync ทั้งหมด]            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 6. TikTok — Backfill ย้อนหลัง 365 วัน                │ │
│  │ ดึงข้อมูล TikTok Ads ทีละ 30 วัน                      │ │
│  │                           [Backfill TikTok]           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 7. ลบข้อมูลในฐานข้อมูล                                  │ │
│  │ ☑ ads_rawdata  ☑ ads_geo  ☑ ads_demographic          │ │
│  │ ☑ ads_device                                           │ │
│  │ วันเริ่มต้น (ไม่บังคับ): [YYYY-MM-DD]                 │ │
│  │ วันสิ้นสุด (ไม่บังคับ):    [YYYY-MM-DD]               │ │
│  │                           [ลบข้อมูล]                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔘 Button 1: Get All Page

**สี**: Green  
**API**: POST `/api/sync-allpage`  
**ใช้เมื่อ**: เพิ่ม account ใหม่

**Success Response**:
```
✅ บันทึกสำเร็จ 3 accounts
   • Business Page 1 (act_123456)
   • Business Page 2 (act_789012)
   • My Store (act_345678)
```

---

## 🔘 Button 2: Backfill

**สี**: Green  
**API**: POST `/api/sync-backfill`  
**ใช้เมื่อ**: เริ่มต้นระบบ, ต้องข้อมูลเก่า

**ระยะเวลา**: 12 เดือนย้อนหลัง  
**⚠️ เวลา**: 5-15 นาที

**Success Response**:
```
✅ Backfill สำเร็จ (2025-06-15 → 2026-06-15)
   • Business Page 1: ads_rawdata:1234 · ads_geo:567
   • Business Page 2: ads_rawdata:2345 · ads_geo:890
```

---

## 🔘 Button 3: ดึงข้อมูลวันนี้

**สี**: Green  
**API**: GET `/api/sync-7days`  
**ใช้เมื่อ**: ดึงข้อมูลวันปัจจุบัน

**ช่วงเวลา**: 00:00 → ตอนนี้

---

## 🔘 Button 4: อัปเดตข้อมูลให้เป็นล่าสุด

**สี**: Green  
**API**: GET `/api/sync-latest`  
**ใช้เมื่อ**: Sync ข้อมูลให้เป็นปัจจุบัน

**ระบบ**: 
1. เช็ควันที่ล่าสุดใน DB
2. ดึง `latest_date` → `วันนี้`

---

## 🔘 Button 5: Resync (Smart Update)

**สี**: Blue  
**API**: POST `/api/sync-resync`  
**ใช้เมื่อ**: ต้องการ update อย่างชาญฉลาด

**ระบบ**:
1. ดึงข้อมูลทั้งหมดตั้งแต่วันแรก → วันนี้
2. เปรียบเทียบ Hash ของแต่ละแถว
3. Update เฉพาะแถวที่เปลี่ยน

**Response**:
```
✅ Resync สำเร็จ · ดึง 5000, อัปเดต 234
   • Business Page 1: ดึง:2500 อัปเดต:120
   • Business Page 2: ดึง:2500 อัปเดต:114
```

---

## 🔘 Button 6: Backfill TikTok

**สี**: Green  
**API**: POST `/api/tiktok/sync`  
**ใช้เมื่อ**: ดึงข้อมูล TikTok Ads

**ระยะเวลา**: 365 วัน (ทีละ 30 วัน)  
**ต้อง**: Advertiser ID ต้อง set ไปแล้ว

---

## 🗑️ Section 7: ลบข้อมูล

### Checkboxes (เลือกตาราง):
- ☑ ads_rawdata (default)
- ☑ ads_geo (default)
- ☑ ads_demographic (default)
- ☑ ads_device (default)

### Date Range (Optional):
- **วันเริ่มต้น**: [YYYY-MM-DD] input
- **วันสิ้นสุด**: [YYYY-MM-DD] input
- ถ้าไม่กรอก → ลบทั้งหมด

### Button: ลบข้อมูล
- สี: Red (danger)
- Confirm: "ยืนยันลบข้อมูลใน: ads_rawdata, ads_geo... (ทั้งหมด) \n การดำเนินการนี้ไม่สามารถย้อนกลับได้"
- ⚠️ ลบแล้วกู้คืนไม่ได้

---

# 6️⃣ LOGIN PAGE `/admin/login`
## เข้าสู่ระบบ Admin

```
┌─────────────────────────────────────────────────────────────┐
│  HOTEL PLUS                                                 │
│  Admin Panel                                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│            ┌──────────────────────────────────┐             │
│            │      Admin Login                 │             │
│            │ กรุณากรอก Username และ Password  │             │
│            ├──────────────────────────────────┤             │
│            │                                  │             │
│            │ Username                         │             │
│            │ [your_username______________]    │             │
│            │                                  │             │
│            │ Password                         │             │
│            │ [••••••____________________]     │             │
│            │                                  │             │
│            │ [❌ Login failed]               │             │
│            │                                  │             │
│            │    [เข้าสู่ระบบ]                │             │
│            │                                  │             │
│            └──────────────────────────────────┘             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **Username** | Text Input | ✅ Yes | ชื่อผู้ใช้ที่สร้างจาก Manage Users |
| **Password** | Password Input | ✅ Yes | รหัสผ่าน (ตัวอักษรกลายเป็น •) |

---

## 🔘 Button: เข้าสู่ระบบ

**สี**: Green (secondary)  
**Loading**: 
```
🔄 (spinner icon)
กำลังเข้าสู่ระบบ…
```

**Success**:
- Redirect ไป `/admin`
- Set cookie "session" (JWT token)

**Error**:
```
⚠️ (warning icon)
Login failed
```

---

# 7️⃣ DOCS PAGE `/admin/docs`
## วิธีใช้งานระบบ

```
┌──────────────────────────────────────────────────────────────┐
│  HOTEL PLUS                          ← Admin                 │
│  📖 วิธีใช้งานระบบ                                            │
├──────────────────────────────────────────────────────────────┤
│  ┌───────────────────┐  ┌────────────────────────────────┐  │
│  │ Sidebar           │  │ Content                        │  │
│  ├───────────────────┤  ├────────────────────────────────┤  │
│  │                   │  │ 📊 ภาพรวมระบบ                 │  │
│  │ 📊 ภาพรวมระบบ    │  │                                │  │
│  │ 🔐 ระบบ Login     │  │ Ads Dashboard เป็นระบบ       │  │
│  │ 📁 จัดการ Account │  │ วิเคราะห์ผลโฆษณา              │  │
│  │ 👥 จัดการ Users   │  │ Facebook Ads แบบเรียลไทม์    │  │
│  │ 🔑 กำหนดสิทธิ์    │  │                                │  │
│  │ ⭐ Highlight Met. │  │ ระบบแบ่งเป็น 2 ส่วนหลัก:      │  │
│  │ 📈 Dashboard      │  │ • Admin Panel                  │  │
│  │ 🔄 Sync Panel     │  │ • Dashboard                    │  │
│  │ 📋 Access Logs    │  │                                │  │
│  │ 🔧 แก้ปัญหา       │  │ [scrollable content...]        │  │
│  │                   │  │                                │  │
│  └───────────────────┘  └────────────────────────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 📑 Sections (10 sections)

### 1. 📊 ภาพรวมระบบ
- โครงสร้างระบบโดยรวม
- 2 role: admin, user

### 2. 🔐 ระบบ Login
- JWT, cookie "session"
- Session expire: 7 วัน

### 3. 📁 จัดการ Accounts
- วิธีเพิ่ม/ลบ/อัพเดต account
- Account ID ต้องตรงกับ Facebook

### 4. 👥 จัดการ Users
- สร้าง user
- เปิด-ปิด user
- Reset password

### 5. 🔑 กำหนดสิทธิ์ (Pages)
- Assign account ให้ user
- ⚠️ ถ้าไม่ assign → user ไม่เห็นข้อมูล
- Admin เห็นทุก account

### 6. ⭐ Highlight Metrics
- กำหนด highlight metric แต่ละ campaign
- เมื่อ user filter campaign → เห็น metric ที่ highlight

### 7. 📈 Dashboard (หน้าผู้ใช้)
- Filter bar (วันที่, account, campaign, ad set)
- Scorecard (KPI cards)
- Frequency gauge

### 8. 📉 กราฟวิเคราะห์
- 7 กราฟ: CPM, Clicks, Messages, Engagement, ...
- Region & Demographics

### 9. 🔄 Sync Panel
- Get All Page, Backfill, Daily Sync, Resync, Clear Data
- TikTok Sync

### 10. 🔧 แก้ปัญหาที่พบบ่อย
- User login ไม่เห็นข้อมูล
- Dashboard ไม่มี account
- กราฟไม่แสดงข้อมูล
- Sync ไม่ทำงาน
- Login ไม่ได้

---

# 📝 TikTok ADVERTISER IDS PAGE `/admin/tiktok-advertiser-ids`

```
┌──────────────────────────────────────────────────────────┐
│  🎯 Manage TikTok Advertiser IDs                          │
│  Set advertiser ID for each TikTok account               │
│  (required for multi-account sync)                       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ℹ️ How to find your Advertiser ID:                     │
│  1. Go to TikTok Ads Manager                            │
│  2. Navigate to Settings → Business Details             │
│  3. Copy your Advertiser Account ID (6-8 digit)         │
│  4. Paste it below for each account                     │
│                                                           │
│  ┌───────────────────────────────────────────────────┐   │
│  │ Account    User ID        Advertiser ID    Status   │  │
│  │ Name       (internal)     (Input field)    Badge    │  │
│  ├───────────────────────────────────────────────────┤   │
│  │ @my_account 10293859384  [1234567_]       ● Active  │  │
│  │                          ✓ Ready to save  ✓ ID Set  │  │
│  │                                            [Save]   │  │
│  │                                                      │  │
│  │ @shop_page  38475839485  [_______]       ● Active  │  │
│  │                                          ⚠️ ID Not  │  │
│  │                                           [Save]    │  │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  ℹ️ Once set, you can use:                             │
│  • POST /api/tiktok/multi-account-sync                 │
│  • POST /api/tiktok/ads-metrics                        │
│  • All data will be saved to database automatically    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 📋 Table: TikTok Tokens

### Column 1: Account Name
- ชื่อบัญชี TikTok (@my_account)

### Column 2: User ID
- Internal ID (monospace)
- สี: Gray

### Column 3: Advertiser ID
- Text Input field
- Placeholder: "Enter advertiser ID"
- ✓ ถ้ามีค่า: "✓ Ready to save" (green)
- ⚠️ ถ้าไม่มี: "⚠️ ID Not Set" (yellow)

### Column 4: Status
- 🟢 Active / 🔴 Inactive
- Expiry date (ถ้ามี)

### Column 5: Save Button
- Disabled ถ้า: ไม่มีค่า หรือ ค่าเดิม
- Label: "💾 Saving..." (loading) / "Save"

---

# 🎯 TIKTOK ERROR PAGE `/admin/tiktok-error`

```
┌──────────────────────────────────────────────────────────┐
│                                                           │
│            ⚠️ Connection Failed                          │
│            We couldn't connect your TikTok account       │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Error: missing_code                              │   │
│  │ Authorization code was not provided by TikTok    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  What to try:                                            │
│  ✓ Check your TikTok credentials                       │
│  ✓ Ensure TIKTOK_CLIENT_ID is configured             │
│  ✓ Verify TIKTOK_REDIRECT_URI matches TikTok app      │
│  ✓ Try again in a few moments                         │
│                                                           │
│  [Try Again]  [Back to Tokens]                         │
│                                                           │
│  If the problem persists, contact support with error   │
│  code: missing_code                                     │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Error Cases

| Error Code | Message |
|-----------|---------|
| `missing_code` | Authorization code was not provided by TikTok |
| `missing_config` | TikTok configuration is not properly set up |
| `store_failed` | Failed to store token in database |
| `callback_failed` | An error occurred during TikTok authentication |
| Other | An unknown error occurred |

---

# 🔍 Helper Functions (Utility)

## fmtDateTime() — Thai Datetime Format
**Input**: ISO string (e.g., "2026-06-15T10:30:00Z") or null  
**Output**: "15 มิ.ย. 2026, 10:30"

## daysAgo() — Calculate Days Ago
**Input**: ISO string or null  
**Output**:
- "วันนี้" (today)
- "เมื่อวาน" (yesterday)
- "5 วันที่แล้ว" (5 days ago)
- "" (if null)

## daysUntil() — Calculate Days Until Expiry
**Input**: ISO string or null  
**Output**:
```tsx
{
  text: "หมดอายุแล้ว" | "อีก 3 วัน" | "อีก 20 วัน" | "",
  warn: boolean
}
```

---

# 🎯 Summary: Menu Navigation

```
┌─ /admin/login ─────── Login Form
│
├─ /admin ──────────── Manage Accounts
│  ├─ Add Account Form
│  ├─ Accounts Table
│  └─ Fetch from Facebook Button
│
├─ /admin/users ────── Manage Users
│  ├─ Create User Form
│  ├─ Users Table
│  ├─ Reset Password (inline)
│  ├─ Permissions Panel (modal-like)
│  └─ Access Logs View
│
├─ /admin/highlights ─ Highlight Metrics
│  └─ Campaign Cards with Metric Toggles
│
├─ /admin/sync ─────── Sync Panel
│  ├─ Get All Page
│  ├─ Backfill
│  ├─ Daily Sync
│  ├─ Sync Latest
│  ├─ Resync
│  ├─ TikTok Sync
│  └─ Clear Data
│
├─ /admin/config ───── System Config
│  ├─ FB Token Status
│  └─ Refresh Token Button
│
├─ /admin/docs ────── How to Use (10 sections)
│
├─ /admin/tiktok-advertiser-ids ─ TikTok Setup
│  └─ Advertiser ID Input Table
│
└─ /admin/tiktok-error ────── Error Page
   └─ Error Message + Troubleshooting
```

---

**Document Version**: 2.0  
**Update Date**: 2026-06-15  
**For**: HOTEL PLUS Admin Panel — Comprehensive UI Guide  
**Created by**: Claude Code
