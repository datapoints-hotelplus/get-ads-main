import AppHeader from "@/app/components/AppHeader";

/** Same header as every other page — ADSCAN's own pages sit under the "ADSCAN" menu group. */
export default function AdscanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader subtitle="ADSCAN — Priority Alert" />
      <div className="max-w-7xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}
