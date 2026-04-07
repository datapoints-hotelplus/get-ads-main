"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const sections = [
  {
    id: "overview",
    icon: "📊",
    title: "ภาพรวมระบบ",
    content: `Ads Dashboard เป็นระบบวิเคราะห์ผลโฆษณา Facebook Ads แบบเรียลไทม์

ระบบแบ่งเป็น 2 ส่วนหลัก:
• Admin Panel — จัดการ account, user, สิทธิ์, และ highlight metrics
• Dashboard — แสดงผลข้อมูลโฆษณาให้ user ดู

ผู้ใช้งานมี 2 role:
• admin — เข้าถึงได้ทุกหน้า เห็นทุก account
• user — เห็นเฉพาะ account ที่ admin assign ให้`,
  },
  {
    id: "login",
    icon: "🔐",
    title: "ระบบ Login",
    content: `ระบบใช้ JWT (JSON Web Token) เก็บใน cookie ชื่อ "session"

วิธี Login:
1. เข้า /login สำหรับ user ทั่วไป
2. เข้า /admin/login สำหรับ admin
3. กรอก username + password แล้วกด "เข้าสู่ระบบ"

หมายเหตุ:
• ถ้า login อยู่แล้ว จะ redirect ไป dashboard อัตโนมัติ
• Session หมดอายุใน 7 วัน
• Logout จะลบ cookie ทั้งหมด`,
  },
  {
    id: "accounts",
    icon: "📁",
    title: "จัดการ Accounts",
    content: `หน้า: /admin

ใช้จัดการ Ad Account ที่จะดึงข้อมูลจาก Facebook

วิธีเพิ่ม Account:
1. กรอก Account Name (ชื่อที่จะแสดงใน dashboard)
2. กรอก Account ID (เช่น act_123456789 หรือ 123456789)
3. กด "Add Account"

จัดการ Account:
• กดปุ่ม Active/Inactive เพื่อเปิด-ปิด account
• กด Delete เพื่อลบ account (ลบแล้วกู้คืนไม่ได้)

⚠️ Account ID ต้องตรงกับ Facebook Ad Account ID จริง`,
  },
  {
    id: "users",
    icon: "👥",
    title: "จัดการ Users",
    content: `หน้า: /admin/users

สร้างและจัดการ user ที่จะเข้าดู dashboard

สร้าง User ใหม่:
1. กรอก Username (ภาษาอังกฤษ ตัวเล็ก)
2. กรอก Password (อย่างน้อย 6 ตัวอักษร)
3. กรอก Display Name (ชื่อที่จะแสดง)
4. กด "Create User"

จัดการ User:
• Active/Disabled — เปิด-ปิดการใช้งาน
• Pages — กำหนดสิทธิ์ดู account (สำคัญมาก!)
• Reset pwd — เปลี่ยนรหัสผ่าน
• Logs — ดูประวัติการเข้าใช้งาน
• Delete — ลบ user`,
  },
  {
    id: "permissions",
    icon: "🔑",
    title: "กำหนดสิทธิ์ (Pages)",
    content: `หน้า: /admin/users → กดปุ่ม "Pages" ข้าง user

ใช้กำหนดว่า user แต่ละคนจะเห็น account ไหนบ้างใน dashboard

วิธีตั้งค่า:
1. กดปุ่ม "Pages" ข้าง user ที่ต้องการ
2. ติ๊กเลือก account ที่ต้องการให้เห็น
3. กด "Save Permissions"

⚠️ สำคัญมาก:
• ถ้าไม่ assign account ใดเลย → user จะไม่เห็นข้อมูลอะไรเลย
• Admin เห็นทุก account โดยไม่ต้อง assign
• เปลี่ยนสิทธิ์แล้วมีผลทันที (user ต้อง refresh หน้า)`,
  },
  {
    id: "highlights",
    icon: "⭐",
    title: "Highlight Metrics",
    content: `หน้า: /admin/highlights

ใช้กำหนดว่าแต่ละ campaign จะ highlight metric ไหนบ้างใน dashboard

วิธีตั้งค่า:
1. ค้นหา campaign ที่ต้องการ
2. กดเลือก metric ที่ต้องการ highlight (จะเปลี่ยนเป็นสีน้ำเงิน)
3. กด "บันทึก"

ปุ่ม "ใช้กับทุก Campaign":
• คัดลอก metric ที่เลือกไว้ไปใช้กับทุก campaign
• ประหยัดเวลาถ้าต้องการตั้งค่าเหมือนกันทั้งหมด

ผลลัพธ์:
• เมื่อ user เลือก campaign ใน dashboard filter
• MetricCard ที่ถูก highlight จะแสดงเป็นพื้นสีฟ้า + ★
• ช่วยให้ user โฟกัสที่ metric สำคัญของแต่ละ campaign`,
  },
  {
    id: "dashboard",
    icon: "📈",
    title: "Dashboard (หน้าผู้ใช้)",
    content: `หน้า: /dashboard

แสดงผลข้อมูลโฆษณา Facebook Ads

Filter Bar (ด้านบน):
• วันเริ่มต้น / วันสิ้นสุด — เลือกช่วงเวลา
• Account — เลือก ad account
• Campaign — เลือก campaign
• Ad Set — เลือก ad set
• กด "ค้นหา" เพื่อโหลดข้อมูล
• กด "รีเซ็ต" เพื่อกลับค่าเริ่มต้น

Scorecard (KPI Cards):
• แสดง metric หลักๆ เช่น Impressions, Clicks, Spend, CTR ฯลฯ
• มี ⓘ tooltip อธิบายแต่ละ metric
• มี % เปลี่ยนแปลงเทียบกับช่วงก่อนหน้า (▲ เพิ่ม / ▼ ลด)
• Metric ที่ถูก highlight จะมีพื้นสีฟ้า + ★

Frequency Gauge:
• แสดงค่า Frequency (จำนวนครั้งเฉลี่ยที่คนเห็นโฆษณา)
• มี tooltip แนะนำค่าที่เหมาะสมตามประเภทธุรกิจ`,
  },
  {
    id: "charts",
    icon: "📉",
    title: "กราฟวิเคราะห์",
    content: `Dashboard มีกราฟ 7 ตัว แต่ละตัวมี ⓘ tooltip อธิบาย:

1. CPM เทียบกับ Impressions
   → ดูว่าการยิงโฆษณาคุ้มไหม
   → ควรเลือก Reach campaign

2. จำนวนคลิก เทียบกับ CPC
   → ดูว่าคนสนใจคลิกไหม
   → ควรเลือก Message หรือ Page like campaign

3. จำนวนแชท เทียบกับ ต้นทุนต่อแชท
   → ดูว่าโฆษณาสร้างลูกค้าทักจริงไหม
   → ควรเลือก Message campaign

4. การมีส่วนร่วม เทียบกับ ต้นทุนต่อ engagement
   → ดูว่าคอนเทนต์น่าสนใจไหม
   → ควรเลือก Engagement campaign

5. ภาพรวมแคมเปญ
   → ดูภาพรวม Spend, Impressions, Reach, Messaging, Leads

6. พื้นที่ — จำนวนคลิก (Region)
   → ดูว่าโฆษณาได้ผลในพื้นที่ไหน

7. กลุ่มเป้าหมาย (Demographics)
   → แยกตามอายุ+เพศ และอุปกรณ์`,
  },
  {
    id: "sync",
    icon: "🔄",
    title: "Sync Panel",
    content: `หน้า: /sync

ใช้ดึงข้อมูลจาก Facebook API มาเก็บใน database

3 ปุ่มหลัก:
1. Get All Page
   → ดึง account จาก rawdata แล้วบันทึกลงตาราง allpage
   → ใช้ตอนเพิ่ม account ใหม่

2. Backfill (6 เดือนย้อนหลัง)
   → ดึงข้อมูลรายวันย้อนหลัง 6 เดือน
   → ใช้ตอนเริ่มต้นระบบ หรือต้องการข้อมูลเก่า
   → ⚠️ ใช้เวลานาน อาจ 5-15 นาที

3. Daily Sync
   → ดึงข้อมูลเมื่อวาน + ลบข้อมูลเกิน 6 เดือน
   → ควรรันทุกวัน (หรือตั้ง cron job)`,
  },
  {
    id: "logs",
    icon: "📋",
    title: "Access Logs",
    content: `หน้า: /admin/users → กด "View All Logs" หรือ "Logs" ข้าง user

แสดงประวัติการเข้าใช้งานของ user

ข้อมูลที่แสดง:
• เวลาที่เข้าใช้
• Username
• หน้าที่เข้า (login, dashboard ฯลฯ)
• IP Address

ใช้ประโยชน์:
• ตรวจสอบว่า user คนไหนเข้าใช้บ่อย
• ดูว่ามีการเข้าใช้จาก IP ผิดปกติไหม
• Filter ดูเฉพาะ user ที่ต้องการได้`,
  },
  {
    id: "troubleshoot",
    icon: "🔧",
    title: "แก้ปัญหาที่พบบ่อย",
    content: `❌ User login แล้วไม่เห็นข้อมูล
→ ตรวจสอบว่า assign account ให้ user แล้วหรือยัง (Pages)

❌ Dashboard ไม่มี account ให้เลือก
→ ตรวจสอบว่าเพิ่ม account ใน admin แล้วหรือยัง
→ ตรวจสอบว่า account เป็น Active

❌ กราฟไม่แสดงข้อมูล
→ กด "ค้นหา" หลังเลือก filter
→ ตรวจสอบว่ามีข้อมูลในช่วงเวลาที่เลือก

❌ Sync ไม่ทำงาน
→ ตรวจสอบ FB_ACCESS_TOKEN ใน .env.local
→ Token อาจหมดอายุ ต้อง generate ใหม่

❌ Login ไม่ได้
→ ตรวจสอบ username/password
→ ตรวจสอบว่า user เป็น Active
→ ลอง clear cookies แล้ว login ใหม่`,
  },
];

export default function AdminDocsPage() {
  const router = useRouter();
  const [active, setActive] = useState("overview");

  const current = sections.find((s) => s.id === active) ?? sections[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← Admin
          </button>
          <h1 className="text-xl font-bold text-gray-900">📖 วิธีใช้งานระบบ</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <nav className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm sticky top-24">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors border-b border-gray-100 last:border-b-0 ${
                    active === s.id
                      ? "bg-yellow-50 text-secondary font-semibold border-l-4 border-l-primary"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span>{s.icon}</span>
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{current.icon}</span>
                <h2 className="text-2xl font-bold text-gray-900">
                  {current.title}
                </h2>
              </div>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {current.content}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
