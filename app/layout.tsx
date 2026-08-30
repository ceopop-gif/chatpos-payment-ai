import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatPOS Merchant Payment System",
  description: "ChatPOS AI Commerce ระบบอัจฉริยะสำหรับรับชำระเงิน ออเดอร์ POS และถอนเงินของร้านค้า",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
