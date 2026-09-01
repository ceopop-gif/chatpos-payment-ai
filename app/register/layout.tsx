import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "สมัครใช้งาน ChatPOS",
  description: "สมัครเปิดใช้บริการ ChatPOS สำหรับร้านค้าได้ง่ายในไม่กี่ขั้นตอน",
};

export default function RegisterLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
