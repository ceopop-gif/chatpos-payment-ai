"use client";

import { useEffect } from "react";

export default function AdminStopPayRedirect() {
  useEffect(() => {
    window.location.replace("/team/stoppay");
  }, []);
  return <main style={{ padding: 24, fontFamily: "sans-serif" }}>กำลังเปิดเมนู STOPPAY สำหรับ Team...</main>;
}
