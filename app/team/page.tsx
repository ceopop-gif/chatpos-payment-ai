"use client";

import { ShieldAlert, ChevronRight, Users } from "lucide-react";
import "../stoppay/stoppay.css";

export default function TeamHomePage() {
  return (
    <div className="stoppay-shell">
      <header className="stoppay-topbar">
        <a href="/" className="stoppay-brand"><span>Chat</span><b>POS</b> Team</a>
        <span className="stoppay-secure"><Users /> TEAM</span>
      </header>
      <main className="stoppay-main">
        <section className="stoppay-hero">
          <div className="stoppay-hero-icon"><Users /></div>
          <div>
            <small>CHATPOS TEAM</small>
            <h1>หลังบ้านเจ้าหน้าที่</h1>
            <p>เมนูสำหรับทีมงานตรวจสอบรายการที่ต้องดำเนินการ</p>
          </div>
        </section>
        <a className="team-menu-card" href="/team/stoppay">
          <span><ShieldAlert /></span>
          <div><small>PAYMENT PROTECTION</small><strong>StopPay</strong><p>ตรวจคำร้อง ดูยอดที่ถูกล็อก และยกเลิก STOPPAY เพื่อปลดล็อกยอด</p></div>
          <ChevronRight />
        </a>
      </main>
    </div>
  );
}
