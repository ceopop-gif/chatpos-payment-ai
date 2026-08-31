import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ใบสั่งอาหาร | ChatPOS",
  description: "เปิดดูรายการ กดรับเรื่อง และยืนยันรับอาหารจากครัว",
};

export default function OrderHandoffLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
