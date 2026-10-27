import AppHeader from "@/app/components/AppHeader";

/**
 * Landing page for anyone logged in with nothing to open yet: a client with
 * no ad account assigned, or HR until the Performance Report exists. Better
 * than a dashboard full of zeros that looks broken.
 */
export default function NoAccessPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader />
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">ยังไม่มีหน้าที่เปิดให้บัญชีนี้</h1>
        <p className="text-sm text-gray-500">
          บัญชีนี้ยังไม่ได้ผูก Ads Account หรือยังไม่ได้รับสิทธิ์เข้าหน้าใด — กรุณาติดต่อ admin
        </p>
      </div>
    </div>
  );
}
