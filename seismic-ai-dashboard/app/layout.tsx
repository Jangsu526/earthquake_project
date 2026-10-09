import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seismic AI | 지진 이벤트 분석 대시보드",
  description: "TensorFlow 기반 3클래스 지진 이벤트 분류 대시보드. STEAD 샘플 및 JSON 3채널 파형의 실제 모델 추론을 실행합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
