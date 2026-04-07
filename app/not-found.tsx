"use client";

export default function NotFound() {
  return (
    <div className=" min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center" data-aos="fade-up">
        <p className="text-8xl font-bold text-gray-200 mb-2">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">ไม่พบหน้านี้</h1>
        <p className="text-sm text-gray-500 mb-8">
          หน้าที่คุณกำลังมองหาอาจถูกลบ หรือ URL ไม่ถูกต้อง
        </p>
        <a
          href="/login"
          className="inline-block bg-secondary hover:bg-secondary-light text-white font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm hover:shadow-md"
        >
          กลับหน้าเข้าสู่ระบบ
        </a>
      </div>
    </div>
  );
}
