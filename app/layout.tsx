import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "咪咪的决斗卡牌库 | Ancient Ledger",
  description: "游戏王卡片数据库、卡组构筑与连锁模拟工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-[#0a0a0a] text-[#f3eacb] min-h-screen" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
