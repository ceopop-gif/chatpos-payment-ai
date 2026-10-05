"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, RefreshCw, ShieldAlert, Store, User, Phone } from "lucide-react";
import "../../stoppay/stoppay.css";

type CaseItem = {
  caseNumber: string;
  gatewayReference: string | null;
  merchantName: string;
  merchantReference: string;
  amount: number;
  paidAt: string;
  slipReference: string | null;
  reporterName: string;
  reporterPhone: string;
  reasonDetail: string;
  status: string;
  merchantContactDeadline: string;
  merchantContactedAt: string | null;
  merchantResponseNote: string;
  holdRequestedAt: string | null;
  refundReviewRequestedAt: string | null;
  resolvedAt: string | null;
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
function statusText(status: string) {
  return status === "merchant_action_required" ? "รอร้านติดต่อ"
    : status === "merchant_contacted" ? "ร้านติดต่อแล้ว"
    : status === "review_required" ? "พักถอน / รอตรวจ"
    : status === "refund_review_requested" ? "ลูกค้าขอคืนเงิน"
    : status === "resolved" ? "ปิดเคสแล้ว"
    : status === "rejected" ? "ปฏิเสธเคส"
    : status;
}

export default function AdminStopPayPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [working, setWorking] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/stoppay", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const payload = await response.json() as { cases?: CaseItem[]; error?: string };
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
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("th-TH");
    if (!term) return cases;
    return cases.filter((item) =>
      (item.caseNumber + " " + item.merchantName + " " + item.reporterName + " " + item.reporterPhone + " " + (item.gatewayReference || "")).toLocaleLowerCase("th-TH").includes(term)
    );
  }, [cases, search]);

  const active = cases.filter((item) => !["resolved", "rejected"].includes(item.status)).length;
  const held = cases.filter((item) => ["review_required", "refund_review_requested"].includes(item.status)).length;

  const act = async (item: CaseItem, action: string) => {
    const promptText = action === "refund_completed"
      ? "ระบุเลขอ้างอิง/หลักฐานการคืนเงิน"
      : action === "reject"
        ? "ระบุเหตุผลที่ปฏิเสธเคส"
        : action === "merchant_contacted_override"
          ? "ระบุหลักฐานหรือผลการตรวจว่าร้านติดต่อแล้ว"
          : "หมายเหตุการพักถอน (ถ้ามี)";
    const note = window.prompt(promptText, item.merchantResponseNote || "");
    if (note === null) return;
    setWorking(item.caseNumber + action);
    setError("");
    try {
      const response = await fetch("/api/admin/stoppay", {
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
        <a href="/admin" className="stoppay-brand"><span>Chat</span><b>POS</b> Admin</a>
        <span className="stoppay-secure"><ShieldAlert /> STOPPAY CONTROL</span>
      </header>

      <main className="stoppay-main">
        <section className="stoppay-hero">
          <div className="stoppay-hero-icon"><ShieldAlert /></div>
          <div>
            <small>ADMIN REVIEW QUEUE</small>
            <h1>ศูนย์ตรวจสอบ STOPPAY</h1>
            <p>ดูเคสทั้งหมด ตรวจการติดต่อของร้าน พักถอน และบันทึกผลการคืนเงิน</p>
          </div>
        </section>

        <a href="/admin" className="admin-stoppay-back"><ArrowLeft /> กลับหลังบ้านใหญ่</a>

        <section className="admin-stoppay-summary">
          <article><small>เคสที่ยังเปิด</small><strong>{active}</strong></article>
          <article className="danger"><small>พักถอน / รอตรวจ</small><strong>{held}</strong></article>
          <article><small>ทั้งหมด</small><strong>{cases.length}</strong></article>
        </section>

        <section className="admin-stoppay-tools">
          <label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเลขเคส ร้าน ชื่อ เบอร์ หรือ Gateway Ref" /></label>
          <button onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} /> รีเฟรช</button>
        </section>

        {error && <div className="stoppay-error"><AlertTriangle /><span>{error}</span></div>}

        <div className="merchant-stoppay-list">
          {filtered.map((item) => {
            const heldCase = ["review_required", "refund_review_requested"].includes(item.status);
            const closed = ["resolved", "rejected"].includes(item.status);
            return (
              <article key={item.caseNumber} className={"merchant-stoppay-case " + (heldCase ? "overdue" : item.merchantContactedAt ? "contacted" : "")}>
                <header>
                  <span><ShieldAlert /></span>
                  <div><small>{item.caseNumber}</small><strong>฿{money.format(item.amount)}</strong></div>
                  <b className={"merchant-stoppay-status " + (heldCase ? "danger" : closed ? "ok" : "warn")}>{statusText(item.status)}</b>
                </header>

                <div className="admin-stoppay-shop">
                  <Store /><span><small>ร้านที่รับเงิน</small><b>{item.merchantName}</b><em>{item.merchantReference}</em></span>
                </div>

                <div className="merchant-stoppay-meta">
                  <span><small>วันเวลาชำระ</small><b>{fmt(item.paidAt)}</b></span>
                  <span><small>กำหนดร้านติดต่อ</small><b>{fmt(item.merchantContactDeadline)}</b></span>
                </div>

                <div className="admin-stoppay-parties">
                  <div><User /><span><small>ผู้แจ้ง</small><b>{item.reporterName}</b></span></div>
                  <div><Phone /><span><small>เบอร์</small><a href={"tel:" + item.reporterPhone}>{item.reporterPhone}</a></span></div>
                </div>

                <div className="merchant-stoppay-reason"><small>เหตุผล / รายละเอียด</small><p>{item.reasonDetail}</p></div>
                {item.gatewayReference && <div className="merchant-stoppay-note">Gateway: {item.gatewayReference}</div>}
                {item.slipReference && <div className="merchant-stoppay-note">เลขที่รายการจากสลิป: {item.slipReference}</div>}
                {item.merchantResponseNote && <div className="merchant-stoppay-note">บันทึกล่าสุด: {item.merchantResponseNote}</div>}

                {heldCase && <div className="stoppay-info amber"><Clock3 /><span><b>ร้านถูกระงับการถอนชั่วคราว</b><small>ปลดได้เมื่อแอดมินตรวจและปิดเคส หรือยืนยันว่าร้านติดต่อแล้ว</small></span></div>}
                {item.refundReviewRequestedAt && <div className="stoppay-info blue"><ShieldAlert /><span><b>ลูกค้ากลับมายืนยัน OTP หลัง 48 ชม.</b><small>ส่งคำขอคืนเงินเมื่อ {fmt(item.refundReviewRequestedAt)}</small></span></div>}

                {!closed && (
                  <div className="admin-stoppay-actions">
                    {!heldCase && <button onClick={() => void act(item, "hold")} disabled={working !== ""}>พักถอน</button>}
                    <button onClick={() => void act(item, "merchant_contacted_override")} disabled={working !== ""}>ยืนยันร้านติดต่อแล้ว</button>
                    <button className="reject" onClick={() => void act(item, "reject")} disabled={working !== ""}>ปฏิเสธเคส</button>
                    {item.status === "refund_review_requested" && <button className="refund" onClick={() => void act(item, "refund_completed")} disabled={working !== ""}>บันทึกคืนเงินแล้ว</button>}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {!loading && !filtered.length && <section className="stoppay-card stoppay-success"><div className="stoppay-success-icon"><CheckCircle2 /></div><h2>ไม่พบเคส</h2><p>ไม่มี STOPPAY ตามเงื่อนไขที่ค้นหา</p></section>}
      </main>
    </div>
  );
}
