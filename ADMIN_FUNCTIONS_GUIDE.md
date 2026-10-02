# Admin Panel Functions Guide
## ครบถ้วนวิธีการใช้ function ทั้งหมดในหน้า Admin

---

## 📁 Admin Main Page (`/app/admin/page.tsx`)

### **fetchAccounts()**
- **ใช้งาน**: ดึงข้อมูล account ทั้งหมด
- **การทำงาน**: 
  - Call `/api/admin/accounts` (GET)
  - ถ้า HTTP 401 จะ redirect ไป `/admin/login`
  - เซ็ต state `accounts[]` และ `loading` เป็น false
- **เรียกใช้ที่**: useEffect (เมื่อ component mount)
- **ตัวอย่าง**:
  ```tsx
  useEffect(() => {
    fetchAccounts();
  }, []);
  ```

### **handleAdd(e: FormEvent)**
- **ใช้งาน**: เพิ่ม Ad Account ใหม่
- **Input**:
  - Account Name (ชื่อที่แสดง)
  - Account ID (ID จาก Facebook เช่น act_123... หรือ 123...)
- **การทำงาน**:
  1. POST `/api/admin/accounts` พร้อม `account_name` + `account_id`
  2. ถ้าสำเร็จ: ล้างฟอร์ม + เรียก `fetchAccounts()` ใหม่
  3. ถ้าล้มเหลว: แสดง error message
- **Error Handling**: แสดง error ใน `addError` state

### **handleToggleActive(account_id: string, current: boolean)**
- **ใช้งาน**: เปิด-ปิด account (Active/Inactive)
- **Parameters**:
  - `account_id`: ID ของ account
  - `current`: สถานะปัจจุบัน (true=Active, false=Inactive)
- **การทำงาน**:
  1. PATCH `/api/admin/accounts` พร้อม `account_id` + `is_active: !current`
  2. Update state ให้ตรงกับ response
  3. ปิด loading indicator
- **UI**: คลิกปุ่ม status ในตาราง

### **handleDelete(account_id: string)**
- **ใช้งาน**: ลบ account ออกจากระบบ
- **Parameters**: `account_id` ของ account ที่ต้องลบ
- **การทำงาน**:
  1. DELETE `/api/admin/accounts` พร้อม `account_id`
  2. ถ้าสำเร็จ: ลบออกจาก state `accounts[]`
  3. ไม่มี confirmation — ลบเลยเลย
- **⚠️ สำคัญ**: ลบแล้วกู้คืนไม่ได้

### **handleLogout()**
- **ใช้งาน**: ออกจากระบบ
- **การทำงาน**:
  1. DELETE `/api/admin/auth` (ลบ session cookie)
  2. Redirect ไป `/admin/login`
- **เรียกใช้ที่**: ปุ่ม "Logout" ที่ header

### **handleFetchFromFacebook()**
- **ใช้งาน**: ดึงข้อมูล Ad Account มาจาก Facebook API
- **การทำงาน**:
  1. Confirm ด้วย window.confirm()
  2. PUT `/api/admin/accounts`
  3. ได้ `fetched` จำนวน account ที่ดึงได้
  4. Refresh account list อัตโนมัติ
- **หมายเหตุ**:
  - ดึงชื่อจาก Facebook มาอัปเดต
  - Account ID เดิมจะอัปเดตชื่อ ไม่ถูกลบ
  - ต้องเชื่อมต่อ Facebook API

---

## ⚙️ Config Page (`/app/admin/config/page.tsx`)

### **loadStatus()**
- **ใช้งาน**: ดึงสถานะการ config ของระบบ
- **การทำงาน**:
  1. GET `/api/admin/config`
  2. ถ้า 401: redirect ไป login
  3. Set `status` state
- **ข้อมูลที่ได้**:
  ```tsx
  {
    token: {
      refreshed_at: string,      // เวลา refresh ล่าสุด
      expires_at: string,        // วันหมดอายุ
      masked: string,            // token ที่ปิดบังไว้
      source: "db"|"env"|"none"  // แหล่งที่มา
    },
    ads_rawdata: {
      latest_date: string,       // วันที่ล่าสุดของข้อมูล
      total_rows: number         // จำนวนแถวทั้งหมด
    }
  }
  ```

### **handleRefresh()**
- **ใช้งาน**: Refresh Facebook Access Token
- **การทำงาน**:
  1. POST `/api/admin/config`
  2. ได้ `masked` (token ปิดบัง) + `expires_in` (วินาทีจนหมดอายุ)
  3. แสดง success message พร้อมวันหมดอายุ
  4. Load status ใหม่
- **เมื่อใช้**: เมื่อ token กำลังหมดอายุหรือ FB API ไม่ตอบสนอง

### **fmtDateTime(iso: string | null): string**
- **ใช้งาน**: แปลง ISO date string → Thai format
- **Input**: ISO datetime (เช่น "2026-06-15T10:30:00Z") หรือ null
- **Output**: เช่น "15 มิ.ย. 2026, 10:30" หรือ "—" ถ้า null
- **ตัวอย่าง**:
  ```tsx
  fmtDateTime("2026-06-15T10:30:00Z")
  // → "15 มิ.ย. 2026, 10:30"
  ```

### **daysAgo(iso: string | null): string**
- **ใช้งาน**: คำนวณกี่วันที่แล้ว
- **Output**:
  - "วันนี้" ถ้าวันเดียวกัน
  - "เมื่อวาน" ถ้า 1 วันที่แล้ว
  - "X วันที่แล้ว" ถ้า > 1 วัน
  - "" ถ้า null
- **ตัวอย่าง**:
  ```tsx
  daysAgo("2026-06-14T10:30:00Z") // → "เมื่อวาน"
  daysAgo("2026-06-10T10:30:00Z") // → "5 วันที่แล้ว"
  ```

### **daysUntil(iso: string | null): { text: string, warn: boolean }**
- **ใช้งาน**: คำนวณกี่วันจนหมดอายุ
- **Output**:
  - `{ text: "หมดอายุแล้ว", warn: true }` ถ้า <= 0 วัน
  - `{ text: "อีก X วัน", warn: true }` ถ้า <= 7 วัน
  - `{ text: "อีก X วัน", warn: false }` ถ้า > 7 วัน
  - `{ text: "", warn: false }` ถ้า null
- **ใช้ประโยชน์**: เตือนเมื่อ token กำลังหมดอายุ

---

## 🎯 TikTok Advertiser IDs (`/app/admin/tiktok-advertiser-ids/page.tsx`)

### **fetchTokens()**
- **ใช้งาน**: ดึงรายการ TikTok token ทั้งหมด
- **การทำงาน**:
  1. GET `/api/tiktok/tokens`
  2. ได้ array ของ TikTokToken
  3. Initialize `editValues` state จากแต่ละ token
- **Data ที่ได้**:
  ```tsx
  {
    id: string,           // Token ID
    username: string,     // ชื่อบัญชี TikTok
    user_id: string,      // TikTok User ID
    advertiser_id?: string,
    is_active: boolean,
    expires_at: string,
    created_at: string
  }
  ```

### **saveAdvertiserId(tokenId: string)**
- **ใช้งาน**: บันทึก Advertiser ID สำหรับ TikTok account
- **Parameters**: `tokenId` ของ token ที่ต้องบันทึก
- **การทำงาน**:
  1. PATCH `/api/tiktok/tokens` พร้อม:
     - `token_id`: tokenId
     - `advertiser_id`: ค่าจาก `editValues[tokenId]`
  2. Update state ถ้า success
  3. Show error ถ้า fail
- **⚠️ สำคัญ**: Advertiser ID ต้องได้จาก TikTok Ads Manager → Settings → Business Details

---

## ❌ TikTok Error Page (`/app/admin/tiktok-error/page.tsx`)

### **getErrorMessage(): string**
- **ใช้งาน**: แปลง error code เป็น message ที่เข้าใจได้
- **Error Cases**:
  - `"missing_code"` → "Authorization code was not provided by TikTok"
  - `"missing_config"` → "TikTok configuration is not properly set up"
  - `"store_failed"` → "Failed to store token in database"
  - `"callback_failed"` → "An error occurred during TikTok authentication"
  - อื่นๆ → "An unknown error occurred"

### **handleRetry()**
- **ใช้งาน**: ลองเชื่อมต่อ TikTok ใหม่
- **การทำงาน**: Redirect ไป `/tiktok/login`

---

## 👥 Users Management (`/app/admin/users/page.tsx`)

### **fetchUsers()**
- **ใช้งาน**: ดึงรายชื่อ user ทั้งหมด
- **การทำงาน**:
  1. GET `/api/admin/users`
  2. ถ้า 401: redirect ไป login
  3. Set `users[]` state
- **Data ที่ได้**:
  ```tsx
  {
    id: string,
    username: string,
    display_name: string | null,
    is_active: boolean,
    created_at: string
  }
  ```

### **handleCreate(e: FormEvent)**
- **ใช้งาน**: สร้าง user ใหม่
- **Input**:
  - Username (ต้องไม่ซ้ำ)
  - Password (อย่างน้อย 6 ตัวอักษร)
  - Display Name (ชื่อที่จะแสดง)
- **การทำงาน**:
  1. POST `/api/admin/users` พร้อมข้อมูลสามอย่าง
  2. ถ้าสำเร็จ: ล้างฟอร์ม + fetch users ใหม่
  3. ถ้าล้มเหลว: แสดง error

### **handleToggleActive(user: User)**
- **ใช้งาน**: เปิด-ปิด user (Active/Disabled)
- **Parameters**: `user` object ที่มี `id` + `is_active`
- **การทำงาน**:
  1. PATCH `/api/admin/users` พร้อม:
     - `id`: user.id
     - `is_active`: !user.is_active
  2. Fetch users ใหม่

### **handleDelete(id: string)**
- **ใช้งาน**: ลบ user
- **Parameters**: `id` ของ user ที่ต้องลบ
- **การทำงาน**:
  1. Confirm ด้วย confirm()
  2. DELETE `/api/admin/users` พร้อม `id`
  3. Fetch users ใหม่
- **⚠️ สำคัญ**: ลบแล้วกู้คืนไม่ได้

### **handleResetPassword(e: FormEvent)**
- **ใช้งาน**: เปลี่ยนรหัสผ่าน user
- **Parameters**:
  - `resetTarget`: id ของ user
  - `resetPwd`: password ใหม่
- **การทำงาน**:
  1. PATCH `/api/admin/users` พร้อม:
     - `id`: resetTarget
     - `password`: resetPwd
  2. Close inline form ถ้าสำเร็จ
  3. แสดง error ถ้าล้มเหลว
- **UI**: Inline form ที่ปรากฏเมื่อกด "Reset pwd"

### **openPermissions(user: User)**
- **ใช้งาน**: เปิด permissions panel สำหรับ user
- **Parameters**: `user` object
- **การทำงาน**:
  1. Set `permUser` = user
  2. Switch view ไป "permissions"
  3. GET `/api/admin/users/{id}/permissions`
  4. ได้ `allAccounts[]` + `granted[]` (account ที่ assign แล้ว)

### **togglePerm(accountId: string)**
- **ใช้งาน**: Toggle สิทธิ์ account เดียว
- **Parameters**: `accountId` ของ account
- **การทำงาน**: เพิ่มหรือลบออกจาก `granted` Set
- **UI**: Checkbox ในตาราง account

### **savePermissions()**
- **ใช้งาน**: บันทึกสิทธิ์ที่เลือก
- **การทำงาน**:
  1. PUT `/api/admin/users/{id}/permissions` พร้อม:
     - `account_ids`: Array ของ account ID ที่เลือก
  2. Switch view กลับไป "users"
- **⚠️ ที่สำคัญ**:
  - ถ้าไม่ assign account ใดเลย → user จะไม่เห็นข้อมูล
  - Admin เห็นทุก account โดยไม่ต้อง assign

### **fetchLogs(userId?: string)**
- **ใช้งาน**: ดึง access logs
- **Parameters**: `userId` (ถ้าต้องการ filter ของ user เดียว)
- **การทำงาน**:
  1. GET `/api/admin/logs?user_id=...` (ถ้ามี userId)
  2. หรือ GET `/api/admin/logs` (ทั้งหมด)
  3. Set `logs[]` state
- **Data ที่ได้**:
  ```tsx
  {
    id: number,
    username: string,
    page: string,       // หน้าที่เข้า
    ip_address: string | null,
    accessed_at: string
  }
  ```

### **openLogs(userId?: string)**
- **ใช้งาน**: เปิด logs view
- **Parameters**: `userId` (optional)
- **การทำงาน**:
  1. Set `logsUser` = userId
  2. Switch view ไป "logs"
  3. Call `fetchLogs(userId)`

### **handleLogout()**
- **ใช้งาน**: ออกจากระบบ
- **การทำงาน**:
  1. DELETE `/api/admin/auth`
  2. Redirect ไป `/admin/login`

### **fmtDatetime(iso: string): string**
- **ใช้งาน**: แปลง ISO datetime → Thai format
- **Output**: เช่น "15/06/2026 10:30"

---

## ⭐ Highlight Metrics (`/app/admin/highlights/page.tsx`)

### **toggle(campaign: string, metric: string)**
- **ใช้งาน**: เพิ่ม/ลบ metric ที่ highlight สำหรับ campaign
- **Parameters**:
  - `campaign`: ชื่อ campaign
  - `metric`: metric key (เช่น "messages", "spend", "ctr" ฯลฯ)
- **การทำงาน**: Toggle เข้า-ออกจาก `highlights[campaign][]`
- **UI**: คลิกปุ่ม metric → เปลี่ยนเป็นสีน้ำเงิน = selected

### **save(campaign: string)**
- **ใช้งาน**: บันทึก highlight metric สำหรับ campaign
- **Parameters**: `campaign` name
- **การทำงาน**:
  1. PUT `/api/admin/highlights` พร้อม:
     - `campaign_name`: campaign
     - `metrics`: array ของ metric ที่เลือก
  2. Set loading indicator ระหว่าง request

### **applyToAll(sourceCampaign: string)**
- **ใช้งาน**: คัดลอก metric ไปใช้กับทุก campaign
- **Parameters**: `sourceCampaign` = campaign ที่จะคัดลอกมา
- **การทำงาน**:
  1. ดึงค่า `highlights[sourceCampaign]`
  2. Copy ไปให้ทุก campaign ใน state
  3. PUT ไปเซฟทุก campaign พร้อมกัน (Promise.all)
  4. ประหยัดเวลาแทนการบันทึกทีละ campaign

---

## 🔄 Sync Panel (`/app/admin/sync/page.tsx`)

### **handleAllPage()**
- **ใช้งาน**: ดึง account ทั้งหมดจาก rawdata บันทึกลง allpage
- **API**: POST `/api/sync-allpage`
- **Response**:
  ```tsx
  {
    success: boolean,
    count: number,           // จำนวน account
    accounts: { account_name, account_id }[]
  }
  ```
- **ใช้เมื่อ**: เพิ่ม account ใหม่

### **handleBackfill()**
- **ใช้งาน**: ดึงข้อมูล 12 เดือนย้อนหลัง
- **API**: POST `/api/sync-backfill`
- **Response**:
  ```tsx
  {
    success: boolean,
    since: string,          // วันเริ่มต้น
    until: string,          // วันสิ้นสุด
    accounts: {
      name: string,
      id: string,
      rows: { [metric]: number },  // จำนวนแถวแต่ละ metric
      error?: string
    }[]
  }
  ```
- **⚠️ สำคัญ**:
  - ใช้เวลานาน (5-15 นาที)
  - ควรใช้ตอนเริ่มต้นระบบ หรือต้องการข้อมูลเก่า

### **handleSync7()**
- **ใช้งาน**: ดึงข้อมูลวันนี้ (00:00 → ตอนนี้)
- **API**: GET `/api/sync-7days`
- **Response**: เหมือน Backfill

### **handleSyncLatest()**
- **ใช้งาน**: Sync จากวันที่ล่าสุดในฐานข้อมูล → วันนี้
- **API**: GET `/api/sync-latest`
- **Response**:
  ```tsx
  {
    success: boolean,
    latestDate: string,     // วันล่าสุดเดิม
    since: string,          // วันที่ดึงตั้งแต่
    until: string,
    accounts: {...}[]
  }
  ```
- **ใช้ประโยชน์**: Sync ข้อมูลให้เป็นล่าสุด

### **handleResync()**
- **ใช้งาน**: Smart Resync — ดึงทั้งหมด แต่อัพเดตเฉพาะแถวที่เปลี่ยน
- **API**: POST `/api/sync-resync`
- **Response**:
  ```tsx
  {
    success: boolean,
    dateFrom: string,
    dateTo: string,
    totalFetched: number,    // ดึงมากี่แถว
    totalUpdated: number,    // อัพเดตกี่แถว
    accounts_synced: number,
    summary: { account, rows_fetched, rows_updated, error? }[]
  }
  ```
- **ใช้ประโยชน์**: ดึงข้อมูลปลีก แต่อัพเดตอย่างชาญฉลาด

### **handleTiktokSync()**
- **ใช้งาน**: ดึงข้อมูล TikTok Ads ย้อนหลัง 365 วัน
- **API**: POST `/api/tiktok/sync`
- **Response**:
  ```tsx
  {
    success: boolean,
    since: string,
    until: string,
    advertisers: {
      advertiser_id: string,
      advertiser_name: string,
      rows: number,
      error?: string
    }[]
  }
  ```

### **handleClearData()**
- **ใช้งาน**: ลบข้อมูลออกจากตาราง
- **Parameters**:
  - `clearTables`: array ของชื่อตาราง
  - `clearDateFrom` / `clearDateTo`: ช่วงวันที่ (optional)
- **API**: DELETE `/api/admin/clear-data` พร้อม:
  ```json
  {
    "tables": ["ads_rawdata", "ads_geo", ...],
    "dateFrom": "2026-01-01",
    "dateTo": "2026-06-15"
  }
  ```
- **Response**:
  ```tsx
  {
    results: {
      [tableName]: { deleted: boolean, error?: string }
    }
  }
  ```
- **⚠️ สำคัญ**:
  - ต้อง confirm ก่อนลบ
  - ลบแล้วกู้คืนไม่ได้
  - ลบได้แบบ full table หรือช่วงวันที่

---

## 🔐 Login (`/app/admin/login/page.tsx`)

### **handleSubmit(e: FormEvent)**
- **ใช้งาน**: SubmitForm login
- **Input**:
  - Username
  - Password
- **API**: POST `/api/admin/auth` พร้อม:
  ```json
  {
    "username": "...",
    "password": "..."
  }
  ```
- **Response**:
  - ถ้า OK: เซ็ต cookie "session" → redirect ไป `/admin`
  - ถ้า not OK: แสดง error message
- **⚠️ สำคัญ**: Session expire ในเวลา 7 วัน

---

## 📖 Docs (`/app/admin/docs/page.tsx`)

- **ไม่มี function ที่ต้องอธิบาย**
- เป็นหน้าแสดง documentation แบบ static
- Sections ทั้งหมดมี content built-in ในไฟล์

---

## 🎯 State Hooks Guide

### Admin Page State:
```tsx
const [accounts, setAccounts] = useState<Account[]>([]);
const [loading, setLoading] = useState(true);
const [newName, setNewName] = useState("");
const [newId, setNewId] = useState("");
const [addError, setAddError] = useState("");
const [addLoading, setAddLoading] = useState(false);
const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
const [toggleLoading, setToggleLoading] = useState<string | null>(null);
const [fetchLoading, setFetchLoading] = useState(false);
const [fetchMessage, setFetchMessage] = useState<{
  type: "success" | "error";
  text: string;
} | null>(null);
```

### Users Page State:
```tsx
const [view, setView] = useState<ViewMode>("users"); // "users" | "permissions" | "logs"
const [users, setUsers] = useState<User[]>([]);
const [usersLoading, setUsersLoading] = useState(true);
// ... more states for create, reset pwd, permissions, logs
```

---

## 🔗 API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/accounts` | GET | ดึง accounts |
| `/api/admin/accounts` | POST | เพิ่ม account |
| `/api/admin/accounts` | PATCH | อัพเดต account |
| `/api/admin/accounts` | DELETE | ลบ account |
| `/api/admin/accounts` | PUT | ดึงจาก Facebook |
| `/api/admin/config` | GET | ดึง config status |
| `/api/admin/config` | POST | Refresh token |
| `/api/admin/users` | GET | ดึง users |
| `/api/admin/users` | POST | สร้าง user |
| `/api/admin/users` | PATCH | อัพเดต user |
| `/api/admin/users` | DELETE | ลบ user |
| `/api/admin/users/{id}/permissions` | GET | ดึง permissions |
| `/api/admin/users/{id}/permissions` | PUT | อัพเดต permissions |
| `/api/admin/highlights` | GET | ดึง highlights |
| `/api/admin/highlights` | PUT | บันทึก highlights |
| `/api/admin/logs` | GET | ดึง access logs |
| `/api/sync-allpage` | POST | Get all page |
| `/api/sync-backfill` | POST | Backfill data |
| `/api/sync-7days` | GET | Sync today |
| `/api/sync-latest` | GET | Sync latest |
| `/api/sync-resync` | POST | Smart resync |
| `/api/tiktok/sync` | POST | TikTok sync |
| `/api/tiktok/tokens` | GET | ดึง TikTok tokens |
| `/api/tiktok/tokens` | PATCH | บันทึก advertiser ID |
| `/api/admin/clear-data` | DELETE | ลบข้อมูล |
| `/api/admin/auth` | POST | Login |
| `/api/admin/auth` | DELETE | Logout |

---

## 💡 Tips & Best Practices

1. **ต้องเข้าสู่ระบบก่อน**: ทุก function ตรวจสอบ 401 response
2. **ปิด Loading Indicator**: อย่าลืม `finally { setLoading(false) }`
3. **Error Handling**: แสดง error message สำหรับทุกการ request
4. **Confirm Actions**: ลบและการเปลี่ยนแปลงสำคัญต้อง confirm
5. **State Update**: อัพเดต state ทันท่วงที (optimistic update) หรือ refetch
6. **Permission Check**: ตรวจสอบสิทธิ์ user เสมอ

---

## 🆘 Common Issues & Solutions

| ปัญหา | สาเหตุ | วิธีแก้ |
|------|--------|--------|
| 401 Unauthorized | session หมดอายุ | Login ใหม่ |
| Account not showing | account ยังไม่ Active | กด Active button |
| User can't see data | ยังไม่ assign permission | ไปที่ Pages กำหนดสิทธิ์ |
| Sync ไม่ทำงาน | Token หมดอายุ | Refresh token ที่ Config page |
| Search ไม่ผลลัพธ์ | ต้องกด "ค้นหา" ก่อน | ทำตามที่บอก |

---

**อัพเดต**: 2026-06-15  
**สำหรับ**: HOTEL PLUS Admin Panel  
**ทำโดย**: Claude Code
