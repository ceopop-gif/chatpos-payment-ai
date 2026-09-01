import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ | ChatPOS",
  description: "เข้าสู่ระบบจัดการร้าน ChatPOS",
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
