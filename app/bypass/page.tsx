"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Phone, RotateCcw, Search, ShieldOff } from "lucide-react";
import "../chatposhub/hub.css";

type Row = {
  phone: string;
  status: string;
  note: string;
  cancelled_by: string | null;
  cancelled_at: string;
  merchant_id: string | null;
  first_name: string | null;
  last_name: string | null;
  business_description: string | null;
  kyc_status: string | null;
  account_status: string | null;
};

export default function BypassPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/bypass", { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace("/admin/login?returnTo=/bypass");
        return;
      }
      const payload = await response.json() as { rows?: Row[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลไม่สำเร็จ");
      setRows(payload.rows ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/bypass", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, note }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "ยกเลิก OTP ไม่สำเร็จ");
      setSuccess(`ยกเลิก OTP สำหรับ ${phone} แล้ว พร้อมตรวจสอบเพื่อเข้า ChatPOS Hub`);
      setPhone("");
      setNote("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ยกเลิก OTP ไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const restoreOtp = async (row: Row) => {
    if (!window.confirm(`เปิด OTP กลับให้เบอร์ ${row.phone} หรือไม่?`)) return;
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/bypass", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: row.phone }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "เปิด OTP กลับไม่สำเร็จ");
      setSuccess(`เปิด OTP กลับให้ ${row.phone} แล้ว`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เปิด OTP กลับไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="hub-shell">
      <header className="hub-topbar">
        <div className="hub-brand"><b>Chat<span>POS</span></b><i /><strong>OTP Bypass</strong></div>
        <a href="/chatposhub" className="hub-top-link"><ShieldOff />ChatPOS Hub</a>
      </header>
      <main className="hub-group-main">
        <a href="/admin" className="hub-back"><ArrowLeft />กลับ Admin ใหญ่</a>
        <section className="hub-title">
          <div><ShieldOff /></div>
          <span><small>OTP BYPASS CONTROL</small><h1>ยกเลิก OTP ร้านค้า</h1><p>ใช้เฉพาะเบอร์ร้านที่มีอยู่ในฐานข้อมูล ChatPOS</p></span>
        </section>

        {error && <div className="hub-error">{error}</div>}
        {success && <div className="hub-success">{success}</div>}

        <section className="hub-panel">
          <div className="hub-card-heading"><Search /><span><strong>ค้นหาและยกเลิก OTP ด้วยเบอร์มือถือ</strong><small>หลังบันทึก เบอร์นี้จึงจะผ่านเงื่อนไขสำหรับ ChatPOS Hub</small></span></div>
          <form className="hub-search-form" onSubmit={add}>
            <label><span>เบอร์มือถือร้านค้า</span><input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0,10))} inputMode="numeric" placeholder="08XXXXXXXX" /></label>
            <button className="hub-primary" disabled={working}><CheckCircle2 />{working ? "กำลังบันทึก..." : "ยกเลิก OTP"}</button>
          </form>
          <label style={{ display:"flex", flexDirection:"column", gap:7, marginTop:12 }}>
            <span style={{ fontSize:12, fontWeight:900, color:"#5f6d80" }}>หมายเหตุ</span>
            <input style={{ minHeight:48, border:"1px solid #dce3ec", borderRadius:12, padding:"0 14px" }} value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น อนุมัติสำหรับ Hub กลุ่ม..." />
          </label>
        </section>

        <section className="hub-panel">
          <div className="hub-section-head"><span><Phone /><strong>เบอร์ที่ยกเลิก OTP แล้ว</strong></span><em>{rows.length} เบอร์</em></div>
          {loading ? <div className="hub-empty">กำลังโหลด...</div> : rows.length === 0 ? <div className="hub-empty">ยังไม่มีเบอร์ที่ยกเลิก OTP</div> : (
            <div className="hub-member-list">
              {rows.map((row) => (
                <article className="hub-member" key={row.phone}>
                  <div className="hub-member-main">
                    <strong>{[row.first_name,row.last_name].filter(Boolean).join(" ") || row.phone}</strong>
                    <small>{row.phone} · KYC {row.kyc_status === "approved" ? "ผ่าน" : row.kyc_status || "ไม่ทราบ"}{row.business_description ? ` · ${row.business_description}` : ""}</small>
                  </div>
                  <div className="hub-member-limit"><span>{row.note || "ยกเลิก OTP แล้ว"}</span></div>
                  <div className="hub-member-actions">
                    <button className="hub-outline" onClick={() => restoreOtp(row)} disabled={working}><RotateCcw />เปิด OTP กลับ</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
