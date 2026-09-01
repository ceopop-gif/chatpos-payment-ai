import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "ChatPOS Backoffice",
  description: "ระบบหลังบ้านจัดการร้าน ตัวแทน KYC และยอดใช้งาน ChatPOS",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
