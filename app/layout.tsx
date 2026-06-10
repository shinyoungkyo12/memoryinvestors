import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemoryInvestors — 메모리 반도체 실시간 모니터",
  description:
    "DRAM/HBM/NAND 메모리 반도체 종목(마이크론·샌디스크·씨게이트·웨스턴디지털·DRAM ETF) 실시간 차트 대시보드",
};

export const viewport: Viewport = {
  themeColor: "#0a0d13",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* 본문: Pretendard (한글 최적화) / 데이터: IBM Plex Mono — 런타임 CDN 로드 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
