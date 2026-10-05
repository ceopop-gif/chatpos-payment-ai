"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Phone, RefreshCw, ShieldAlert, Store, User } from "lucide-react";
import "../../stoppay/stoppay.css";

type StopPayCase = {
  caseNumber: string;
  gatewayReference: string | null;
  merchantName: string;
  merchantReference: string;
  amount: number;
  paidAt: string;
  slipReference: string | null;
  reporterName: string;
  reporterPhone: string;
  reasonCode: string;
  reasonDetail: string;
  status: string;
  heldAt: string | null;
  createdAt: string;
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
function fmt(value: string | null) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? value : dateTime.format(d);
}

export default function TeamStopPayPage() {
  const [cases, setCases] = useState<StopPayCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/team/stoppay", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const payload = await response.json() as { cases?: StopPayCase[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "โหลด STOPPAY ไม่สำเร็จ");
      setCases(payload.cases || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "โหลด STOPPAY ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("th-TH");
    if (!term) return cases;
    return cases.filter((item) =>
      (item.caseNumber + " " + item.merchantName + " " + item.reporterName + " " + item.reporterPhone + " " + (item.gatewayReference || "")).toLocaleLowerCase("th-TH").includes(term)
    );
  }, [cases, search]);

  const act = async (item: StopPayCase, action: "accept_review" | "cancel_stoppay" | "keep_hold") => {
    let note = "";
    if (action === "cancel_stoppay") {
      const value = window.prompt("ระบุเหตุผลที่ยกเลิก STOPPAY และปลดล็อกยอด", "");
      if (value === null) return;
      note = value.trim();
      if (note.length < 5) return setError("กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร");
    } else {
      const value = window.prompt(action === "accept_review" ? "บันทึกการรับตรวจ (ถ้ามี)" : "บันทึกเหตุผลที่คงการล็อกยอด (ถ้ามี)", "");
      if (value === null) return;
      note = value.trim();
    }

    setWorking(item.caseNumber + action);
    setError("");
    try {
      const response = await fetch("/api/team/stoppay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseNumber: item.caseNumber, action, note }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกไม่สำเร็จ");
    } finally {
      setWorking("");
    }
  };

  return (
    <div className="stoppay-shell">
      <header className="stoppay-topbar">
        <a href="/team" className="stoppay-brand"><span>Chat</span><b>POS</b> Team</a>
        <span className="stoppay-secure"><ShieldAlert /> STOPPAY {cases.length ? "(" + cases.length + ")" : ""}</span>
      </header>
      <main className="stoppay-main">
        <section className="stoppay-hero">
          <div className="stoppay-hero-icon"><ShieldAlert /></div>
          <div>
            <small>TEAM REVIEW</small>
            <h1>StopPay</h1>
            <p>ทุกเคสที่ลูกค้ายืนยัน OTP แล้วจะเข้าหน้านี้ และยอดของรายการจะถูกล็อกทันที</p>
          </div>
        </section>

        <a href="/team" className="admin-stoppay-back"><ArrowLeft /> กลับเมนู Team</a>

        <section className="team-stoppay-warning">
          <ShieldAlert />
          <div><b>ยอดถูกล็อกก่อนครบ 24 ชั่วโมง</b><p>รายการที่มี STOPPAY จะไม่ถูกรวมเป็นยอดพร้อมถอน จนกว่าเจ้าหน้าที่ Team จะกด “ยกเลิก STOPPAY / ปลดล็อกยอด”</p></div>
        </section>

        <section className="admin-stoppay-tools">
          <label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเลขเคส ร้าน ผู้แจ้ง เบอร์ หรือ Gateway Ref" /></label>
          <button onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} /> รีเฟรช</button>
        </section>

        {error && <div className="stoppay-error"><AlertTriangle /><span>{error}</span></div>}

        <div className="merchant-stoppay-list">
          {filtered.map((item) => (
            <article key={item.caseNumber} className="merchant-stoppay-case overdue">
              <header>
                <span><ShieldAlert /></span>
                <div><small>{item.caseNumber}</small><strong>฿{money.format(item.amount)}</strong></div>
                <b className="merchant-stoppay-status danger">{item.status === "team_review_required" ? "รอเจ้าหน้าที่ตรวจ" : "กำลังตรวจสอบ"}</b>
              </header>

              <div className="admin-stoppay-shop">
                <Store /><span><small>ร้านที่รับเงิน</small><b>{item.merchantName}</b><em>{item.merchantReference}</em></span>
              </div>

              <a className="team-slip-preview" href={"/api/team/stoppay/slip/" + encodeURIComponent(item.caseNumber)} target="_blank" rel="noreferrer">
                <img src={"/api/team/stoppay/slip/" + encodeURIComponent(item.caseNumber)} alt={"สลิป " + item.caseNumber} />
                <span>กดดูสลิปขนาดเต็ม</span>
              </a>

              <div className="merchant-stoppay-meta">
                <span><small>วันเวลาชำระ</small><b>{fmt(item.paidAt)}</b></span>
                <span><small>ล็อกยอดเมื่อ</small><b>{fmt(item.heldAt)}</b></span>
              </div>

              <div className="admin-stoppay-parties">
                <div><User /><span><small>ชื่อ-นามสกุลผู้แจ้ง</small><b>{item.reporterName}</b></span></div>
                <div><Phone /><span><small>เบอร์ที่ยืนยัน OTP</small><a href={"tel:" + item.reporterPhone}>{item.reporterPhone}</a></span></div>
              </div>

              <div className="merchant-stoppay-reason"><small>เหตุผลที่แจ้ง</small><p>{item.reasonDetail}</p></div>
              {item.gatewayReference && <div className="merchant-stoppay-note">Gateway: {item.gatewayReference}</div>}
              {item.slipReference && <div className="merchant-stoppay-note">เลขที่รายการจากสลิป: {item.slipReference}</div>}

              <div className="stoppay-info amber"><Clock3 /><span><b>ยอดนี้ไม่พร้อมถอน</b><small>คงสถานะล็อกจนกว่า Team จะยกเลิก STOPPAY</small></span></div>

              <div className="team-stoppay-actions">
                {item.status === "team_review_required" && <button onClick={() => void act(item, "accept_review")} disabled={working !== ""}>รับเรื่องตรวจสอบ</button>}
                <button onClick={() => void act(item, "keep_hold")} disabled={working !== ""}>คงการล็อกยอด</button>
                <button className="unlock" onClick={() => void act(item, "cancel_stoppay")} disabled={working !== ""}><CheckCircle2 /> ยกเลิก STOPPAY / ปลดล็อกยอด</button>
              </div>
            </article>
          ))}
        </div>

        {!loading && !filtered.length && <section className="stoppay-card stoppay-success"><div className="stoppay-success-icon"><CheckCircle2 /></div><h2>ไม่มีเคส STOPPAY ค้าง</h2><p>ยังไม่มีรายการที่รอเจ้าหน้าที่ตรวจสอบ</p></section>}
      </main>
    </div>
  );
}
