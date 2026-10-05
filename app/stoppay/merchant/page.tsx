"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Phone, RefreshCw, ShieldAlert, Store } from "lucide-react";
import "../stoppay.css";

type StopPayCase = {
  caseNumber: string;
  amount: number;
  paidAt: string;
  reporterName: string;
  reporterPhone: string;
  reasonCode: string;
  reasonDetail: string;
  status: string;
  merchantContactDeadline: string;
  merchantContactedAt: string | null;
  merchantResponseNote: string;
  holdRequestedAt: string | null;
  createdAt: string;
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
function fmt(value: string) {
  const d = new Date(value.includes("T") ? value : value + "Z");
  return Number.isNaN(d.getTime()) ? value : dateTime.format(d);
}

export default function MerchantStopPayPage() {
  const [cases, setCases] = useState<StopPayCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activeCount = useMemo(() => cases.filter((item) => item.status !== "resolved").length, [cases]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/stoppay/merchant", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      const payload = await response.json() as { cases?: StopPayCase[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "โหลด STOPPAY ไม่สำเร็จ");
      setCases(payload.cases || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลด STOPPAY ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const markContacted = async (item: StopPayCase) => {
    const note = window.prompt("บันทึกการติดต่อ เช่น โทรแล้ว / คุยกับลูกค้าแล้ว / นัดแก้ไข", item.merchantResponseNote || "");
    if (note === null) return;
    const response = await fetch("/api/stoppay/merchant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseNumber: item.caseNumber, action: "contacted", note }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setError(payload.error || "บันทึกไม่สำเร็จ");
    await load();
  };

  const markResolved = async (item: StopPayCase) => {
    const note = window.prompt("ระบุผลการแก้ไขก่อนปิดเคส", item.merchantResponseNote || "");
    if (!note) return;
    const response = await fetch("/api/stoppay/merchant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseNumber: item.caseNumber, action: "resolved", note }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setError(payload.error || "ปิดเคสไม่สำเร็จ");
    await load();
  };

  return (
    <div className="stoppay-shell">
      <header className="stoppay-topbar">
        <a href="/" className="stoppay-brand"><span>Chat</span><b>POS</b></a>
        <span className="stoppay-secure"><ShieldAlert /> STOPPAY {activeCount ? "(" + activeCount + ")" : ""}</span>
      </header>
      <main className="stoppay-main">
        <section className="stoppay-hero">
          <div className="stoppay-hero-icon"><Store /></div>
          <div>
            <small>MERCHANT ACTION REQUIRED</small>
            <h1>รายการ STOPPAY ของร้าน</h1>
            <p>เมื่อลูกค้าแจ้ง STOPPAY ร้านต้องติดต่อผู้แจ้งตามเบอร์ที่ยืนยันไว้ภายใน 48 ชั่วโมง</p>
          </div>
        </section>

        <div className="merchant-stoppay-toolbar">
          <div><b>{activeCount}</b><span>เคสที่ต้องดูแล</span></div>
          <button onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} /> รีเฟรช</button>
        </div>

        {error && <div className="stoppay-error"><AlertTriangle /><span>{error}</span></div>}

        {!loading && cases.length === 0 && (
          <section className="stoppay-card stoppay-success">
            <div className="stoppay-success-icon"><CheckCircle2 /></div>
            <h2>ไม่มี STOPPAY ค้าง</h2>
            <p>ร้านไม่มีเคสที่ต้องติดต่อในขณะนี้</p>
          </section>
        )}

        <div className="merchant-stoppay-list">
          {cases.map((item) => {
            const overdue = Boolean(item.holdRequestedAt);
            const contacted = Boolean(item.merchantContactedAt);
            return (
              <article key={item.caseNumber} className={"merchant-stoppay-case " + (overdue ? "overdue" : contacted ? "contacted" : "")}>
                <header>
                  <span><ShieldAlert /></span>
                  <div>
                    <small>{item.caseNumber}</small>
                    <strong>฿{money.format(item.amount)}</strong>
                  </div>
                  <b className={"merchant-stoppay-status " + (overdue ? "danger" : contacted ? "ok" : "warn")}>
                    {overdue ? "ระงับการถอน / รอตรวจสอบ" : contacted ? "ติดต่อแล้ว" : "ต้องติดต่อ"}
                  </b>
                </header>

                <div className="merchant-stoppay-meta">
                  <span><small>วันเวลาชำระ</small><b>{fmt(item.paidAt)}</b></span>
                  <span><small>กำหนดติดต่อภายใน</small><b>{fmt(item.merchantContactDeadline)}</b></span>
                </div>

                <div className="merchant-stoppay-reporter">
                  <Phone />
                  <div><small>ผู้แจ้ง</small><b>{item.reporterName}</b><a href={"tel:" + item.reporterPhone}>{item.reporterPhone}</a></div>
                  <a className="merchant-call-button" href={"tel:" + item.reporterPhone}>โทรหา</a>
                </div>

                <div className="merchant-stoppay-reason">
                  <small>เหตุผลที่แจ้ง</small>
                  <p>{item.reasonDetail}</p>
                </div>

                {item.merchantResponseNote && <div className="merchant-stoppay-note">บันทึกร้าน: {item.merchantResponseNote}</div>}

                {overdue && (
                  <div className="stoppay-info amber"><AlertTriangle /><span><b>ครบ 48 ชั่วโมงโดยไม่มีการบันทึกว่าติดต่อ</b><small>ระบบตั้งสถานะระงับการถอนจนกว่าจะมีการตรวจสอบและสรุปเคส</small></span></div>
                )}

                <div className="merchant-stoppay-actions">
                  {!contacted && !overdue && <button onClick={() => void markContacted(item)}><Phone /> บันทึกว่าติดต่อแล้ว</button>}
                  {contacted && !overdue && <button className="resolve" onClick={() => void markResolved(item)}><CheckCircle2 /> ปิดเคสเมื่อแก้ไขแล้ว</button>}
                </div>
              </article>
            );
          })}
        </div>

        <section className="stoppay-policy">
          <h3>ข้อควรปฏิบัติของร้าน</h3>
          <div><b>โทรกลับจริง</b><span>ใช้เบอร์ที่ลูกค้ายืนยัน OTP และบันทึกผลการติดต่อในระบบ</span></div>
          <div><b>เก็บหลักฐาน</b><span>เก็บหลักฐานการขาย การส่งสินค้า หรือการให้บริการ เพื่อใช้ชี้แจงหากมีข้อพิพาท</span></div>
          <div><b>48 ชั่วโมง</b><span>หากไม่ติดต่อภายในกำหนด ระบบจะเปลี่ยนเคสเป็นรอตรวจสอบและระงับการถอน</span></div>
        </section>
      </main>
    </div>
  );
}
