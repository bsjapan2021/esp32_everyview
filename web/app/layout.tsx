import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { TopNav, MobileNav } from "@/components/nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ESP32CAM-Guard · 감시 대시보드",
  description:
    "ESP32-CAM 기반 IoT 감시 시스템의 클라우드 대시보드 — 감지 이벤트, 라이브 뷰, 디바이스 및 펌웨어 관리",
};

export const viewport: Viewport = {
  themeColor: "#090d16",
  width: "device-width",
  initialScale: 1,
};

/** Set theme class before paint to avoid a flash. Default is dark. */
const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('theme');
    var dark = stored ? stored === 'dark' : true;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <Providers>
          <TopNav />
          <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-10">
            {children}
          </main>
          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
