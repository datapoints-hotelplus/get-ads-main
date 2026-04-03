import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AosProvider from "./AosProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ads Dashboard — วิเคราะห์โฆษณา Facebook",
  description: "แดชบอร์ดวิเคราะห์ผลโฆษณา Facebook Ads แบบเรียลไทม์ ดู Spend, ROAS, CPM, CPC และอื่นๆ",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AosProvider>{children}</AosProvider>
      </body>
    </html>
  );
}
