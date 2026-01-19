import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "사유의 뇌 | 17년간의 기록",
  description: "2007년부터 현재까지, 17년간 축적된 사유의 네트워크. 뉴런처럼 연결된 글들을 탐험하세요.",
  keywords: ["블로그", "에세이", "사유", "네트워크", "시각화"],
  authors: [{ name: "kukjin" }],
  openGraph: {
    title: "사유의 뇌",
    description: "17년간의 기록을 뉴런 네트워크로 탐험하세요",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
