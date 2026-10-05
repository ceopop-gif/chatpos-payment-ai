"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  FileCheck2,
  KeyRound,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
  UploadCloud,
  User,
} from "lucide-react";
import "./stoppay.css";

type Match = {
  lookupToken: string;
  merchantName: string;
  merchantReference: string;
  amount: number;
  paidAt: string;
  method: string;
  slipReference: string | null;
};

type AnalyzePayload = {
  needsManual?: boolean;
  reason?: string;
  error?: string;
  extracted?: {
    amount?: number | null;
    paidAt?: string | null;
    transactionReference?: string | null;
    bankName?: string | null;
  };
  match?: Match;
};

type Tab = "report" | "track";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDateTime = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : thaiDateTime.format(date);
}

export default function StopPayPage() {
  const [tab, setTab] = useState<Tab>("report");
  const [slip, setSlip] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualAmount, setManualAmount] = useState("");
  const [manualPaidAt, setManualPaidAt] = useState("");
  const [manualReference, setManualReference] = useState("");
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reasonCode, setReasonCode] = useState("fraud");
  const [reasonDetail, setReasonDetail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState("");
  const [otpReference, setOtpReference] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpVerifiedToken, setOtpVerifiedToken] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [caseResult, setCaseResult] = useState<{ caseNumber: string; deadline: string } | null>(null);

  const [trackCase, setTrackCase] = useState("");
  const [trackPhone, setTrackPhone] = useState("");
  const [trackName, setTrackName] = useState("");
  const [trackMessage, setTrackMessage] = useState("");
  const [trackOtpSession, setTrackOtpSession] = useState("");
  const [trackOtpRef, setTrackOtpRef] = useState("");
  const [trackOtp, setTrackOtp] = useState("");
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackDone, setTrackDone] = useState(false);

  const canRequestOtp = useMemo(
    () => Boolean(match && name.trim().length >= 2 && /^0\d{9}$/.test(phone.replace(/\D/g, "")) && reasonDetail.trim().length >= 5 && accepted),
    [match, name, phone, reasonDetail, accepted],
  );

  const chooseSlip = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSlip(file);
    setMatch(null);
    setError("");
    setManualMode(false);
    setOtpSessionId("");
    setOtpVerifiedToken("");
    setCaseResult(null);
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setSlipPreview(file ? URL.createObjectURL(file) : "");
  };

  const analyze = async (manual = false) => {
    if (!manual && !slip) {
      setError("กรุณาเลือกรูปสลิปก่อน");
      return;
    }
    setAnalyzing(true);
    setError("");
    try {
      const form = new FormData();
      if (slip) form.set("slip", slip);
      if (manual) {
        form.set("amount", manualAmount);
        form.set("paidAt", manualPaidAt);
        form.set("slipReference", manualReference);
      }
      const response = await fetch("/api/stoppay/analyze", { method: "POST", body: form });
      const payload = await response.json() as AnalyzePayload;
      if (!response.ok) throw new Error(payload.error || "ตรวจสลิปไม่สำเร็จ");
      if (payload.needsManual) {
        setManualMode(true);
        if (payload.extracted?.amount) setManualAmount(String(payload.extracted.amount));
        if (payload.extracted?.transactionReference) setManualReference(payload.extracted.transactionReference);
        throw new Error(payload.reason || "กรุณากรอกยอดและวันเวลาจากสลิป");
      }
      if (!payload.match) throw new Error("ไม่พบร้านที่ตรงกับรายการนี้");
      setMatch(payload.match);
      setManualMode(false);
      if (payload.extracted?.amount) setManualAmount(String(payload.extracted.amount));
      if (payload.extracted?.transactionReference) setManualReference(payload.extracted.transactionReference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตรวจสลิปไม่สำเร็จ");
    } finally {
      setAnalyzing(false);
    }
  };

  const requestOtp = async () => {
    if (!match || !canRequestOtp) return;
    setSendingOtp(true);
    setError("");
    try {
      const response = await fetch("/api/stoppay/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookupToken: match.lookupToken, phone, name }),
      });
      const payload = await response.json() as { sessionId?: string; referenceCode?: string; error?: string };
      if (!response.ok || !payload.sessionId) throw new Error(payload.error || "ส่ง OTP ไม่สำเร็จ");
      setOtpSessionId(payload.sessionId);
      setOtpReference(payload.referenceCode || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่ง OTP ไม่สำเร็จ");
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpSessionId || otpCode.trim().length < 4) return;
    setVerifyingOtp(true);
    setError("");
    try {
      const response = await fetch("/api/stoppay/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: otpSessionId, otpCode }),
      });
      const payload = await response.json() as { verificationToken?: string; error?: string };
      if (!response.ok || !payload.verificationToken) throw new Error(payload.error || "OTP ไม่ถูกต้อง");
      setOtpVerifiedToken(payload.verificationToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยืนยัน OTP ไม่สำเร็จ");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const submitStopPay = async () => {
    if (!otpVerifiedToken || !slip || !match) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.set("verificationToken", otpVerifiedToken);
      form.set("reasonCode", reasonCode);
      form.set("reasonDetail", reasonDetail);
      form.set("declarationAccepted", "true");
      form.set("slip", slip);
      const response = await fetch("/api/stoppay/cases", { method: "POST", body: form });
      const payload = await response.json() as {
        caseNumber?: string;
        merchantContactDeadline?: string;
        error?: string;
      };
      if (!response.ok || !payload.caseNumber) throw new Error(payload.error || "สร้างเคส STOPPAY ไม่สำเร็จ");
      setCaseResult({ caseNumber: payload.caseNumber, deadline: payload.merchantContactDeadline || "" });
      setTrackCase(payload.caseNumber);
      setTrackPhone(phone);
      setTrackName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างเคส STOPPAY ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const prepareTrack = async () => {
    setTrackBusy(true);
    setTrackMessage("");
    setTrackDone(false);
    try {
      const response = await fetch("/api/stoppay/recontact/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseNumber: trackCase, phone: trackPhone }),
      });
      const payload = await response.json() as {
        ready?: boolean;
        lookupToken?: string;
        waiting?: boolean;
        contacted?: boolean;
        merchantContactDeadline?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "ตรวจสอบเคสไม่สำเร็จ");
      setTrackMessage(payload.message || "");
      if (!payload.ready || !payload.lookupToken) return;

      const otpResponse = await fetch("/api/stoppay/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookupToken: payload.lookupToken, phone: trackPhone, name: trackName || "ผู้แจ้ง STOPPAY" }),
      });
      const otpPayload = await otpResponse.json() as { sessionId?: string; referenceCode?: string; error?: string };
      if (!otpResponse.ok || !otpPayload.sessionId) throw new Error(otpPayload.error || "ส่ง OTP ไม่สำเร็จ");
      setTrackOtpSession(otpPayload.sessionId);
      setTrackOtpRef(otpPayload.referenceCode || "");
    } catch (err) {
      setTrackMessage(err instanceof Error ? err.message : "ตรวจสอบเคสไม่สำเร็จ");
    } finally {
      setTrackBusy(false);
    }
  };

  const confirmTrack = async () => {
    if (!trackOtpSession || !trackOtp) return;
    setTrackBusy(true);
    try {
      const verifyResponse = await fetch("/api/stoppay/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: trackOtpSession, otpCode: trackOtp }),
      });
      const verifyPayload = await verifyResponse.json() as { verificationToken?: string; error?: string };
      if (!verifyResponse.ok || !verifyPayload.verificationToken) throw new Error(verifyPayload.error || "OTP ไม่ถูกต้อง");

      const response = await fetch("/api/stoppay/recontact/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseNumber: trackCase, verificationToken: verifyPayload.verificationToken }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "ส่งเรื่องเข้าตรวจสอบไม่สำเร็จ");
      setTrackDone(true);
      setTrackMessage(payload.message || "ส่งเรื่องเข้าตรวจสอบแล้ว");
    } catch (err) {
      setTrackMessage(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setTrackBusy(false);
    }
  };

  const reset = () => {
    setSlip(null);
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setSlipPreview("");
    setMatch(null);
    setError("");
    setManualMode(false);
    setOtpSessionId("");
    setOtpCode("");
    setOtpVerifiedToken("");
    setCaseResult(null);
  };

  return (
    <div className="stoppay-shell">
      <header className="stoppay-topbar">
        <a href="/" className="stoppay-brand"><span>Chat</span><b>POS</b></a>
        <span className="stoppay-secure"><ShieldAlert /> STOPPAY</span>
      </header>

      <main className="stoppay-main">
        <section className="stoppay-hero">
          <div className="stoppay-hero-icon"><ShieldAlert /></div>
          <div>
            <small>PAYMENT PROTECTION</small>
            <h1>แจ้ง STOPPAY จากสลิป</h1>
            <p>ใช้สำหรับกรณีถูกหลอกหรือไม่ได้รับสินค้า/บริการจริง ภายใน 24 ชั่วโมงหลังชำระ</p>
          </div>
        </section>

        <div className="stoppay-tabs">
          <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>แจ้ง STOPPAY</button>
          <button className={tab === "track" ? "active" : ""} onClick={() => setTab("track")}>ติดตามหลัง 48 ชม.</button>
        </div>

        {tab === "report" ? (
          <>
            {!caseResult && (
              <section className="stoppay-card">
                <div className="stoppay-card-head">
                  <span>1</span>
                  <div><h2>ส่งรูปสลิป</h2><p>ระบบอ่านยอด วันเวลา และค้นหาร้านจากรายการ ChatPOS</p></div>
                </div>

                <label className={"stoppay-upload " + (slipPreview ? "has-image" : "")}>
                  {slipPreview ? <img src={slipPreview} alt="สลิปที่เลือก" /> : <><UploadCloud /><strong>เลือกรูปสลิป</strong><small>JPG / PNG / WEBP ไม่เกิน 6 MB</small></>}
                  <input type="file" accept="image/*" onChange={chooseSlip} />
                </label>

                {!match && (
                  <button className="stoppay-primary" disabled={!slip || analyzing} onClick={() => analyze(false)}>
                    {analyzing ? <><RefreshCw className="spin" /> กำลังอ่านสลิป...</> : <><Search /> ตรวจสอบสลิปและค้นหาร้าน</>}
                  </button>
                )}

                {manualMode && !match && (
                  <div className="stoppay-manual">
                    <div className="stoppay-info amber"><AlertTriangle /><span><b>กรอกข้อมูลจากสลิป</b><small>ใช้เมื่อระบบอ่านภาพอัตโนมัติไม่ครบ</small></span></div>
                    <label><span>ยอดเงิน (บาท)</span><input inputMode="decimal" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="เช่น 1.00" /></label>
                    <label><span>วันและเวลาชำระ</span><input type="datetime-local" value={manualPaidAt} onChange={(e) => setManualPaidAt(e.target.value)} /></label>
                    <label><span>เลขที่รายการ (ถ้ามี)</span><input value={manualReference} onChange={(e) => setManualReference(e.target.value)} placeholder="เลขที่รายการจากสลิป" /></label>
                    <button className="stoppay-secondary" disabled={!manualAmount || !manualPaidAt || analyzing} onClick={() => analyze(true)}>
                      <Search /> ค้นหารายการ
                    </button>
                  </div>
                )}

                {match && (
                  <div className="stoppay-match">
                    <div className="stoppay-match-title"><CheckCircle2 /><span><b>พบรายการที่ตรงกัน</b><small>ยอดและเวลาตรงกับรายการรับเงินของ ChatPOS</small></span></div>
                    <div className="stoppay-amount">฿{money.format(match.amount)}</div>
                    <div className="stoppay-match-grid">
                      <span><small>ร้านที่รับเงิน</small><strong><Store /> {match.merchantName}</strong></span>
                      <span><small>วันเวลาชำระ</small><strong><Clock3 /> {formatDate(match.paidAt)}</strong></span>
                    </div>
                    {match.slipReference && <div className="stoppay-reference">เลขที่รายการ: {match.slipReference}</div>}
                  </div>
                )}
              </section>
            )}

            {match && !caseResult && (
              <section className="stoppay-card">
                <div className="stoppay-card-head">
                  <span>2</span>
                  <div><h2>ยืนยันผู้แจ้งและเหตุการณ์</h2><p>ร้านจะได้รับชื่อ เบอร์โทร และเหตุผลเพื่อให้ติดต่อกลับ</p></div>
                </div>

                <div className="stoppay-field-row">
                  <label><span><User /> ชื่อผู้แจ้ง</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ-นามสกุล" /></label>
                  <label><span><Phone /> เบอร์มือถือ</span><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="08xxxxxxxx" /></label>
                </div>

                <label className="stoppay-select-label">
                  <span>เหตุผลที่แจ้ง</span>
                  <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                    <option value="fraud">ถูกหลอกให้โอนเงิน / สงสัยถูกโกง</option>
                    <option value="not_received">ไม่ได้รับสินค้า หรือไม่ได้รับบริการ</option>
                    <option value="other">เหตุฉุกเฉินอื่นที่เกี่ยวกับการฉ้อโกง</option>
                  </select>
                </label>

                <label className="stoppay-detail">
                  <span>อธิบายว่าเกิดอะไรขึ้น</span>
                  <textarea value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} rows={5} maxLength={2000} placeholder="เช่น ชำระเงินแล้ว ร้านไม่ส่งสินค้า ติดต่อไม่ได้ และมีหลักฐานการสนทนา..." />
                </label>

                <div className="stoppay-warning">
                  <AlertTriangle />
                  <div>
                    <b>STOPPAY ใช้เฉพาะกรณีถูกโกงจริง</b>
                    <p>ห้ามแจ้งเท็จ ห้ามใช้กรณีรับสินค้า/บริการแล้วแต่เปลี่ยนใจ หรือใช้เพื่อหลีกเลี่ยงการชำระเงิน ข้อมูลการแจ้งจะถูกเก็บเป็นหลักฐานการตรวจสอบ</p>
                  </div>
                </div>

                <label className="stoppay-consent">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                  <span>ฉันยืนยันว่าข้อมูลที่แจ้งเป็นความจริง ยังไม่ได้รับสินค้า/บริการตามที่ตกลง หรือมีเหตุเชื่อได้ว่าถูกหลอก และยินยอมให้ ChatPOS ส่งข้อมูลที่จำเป็นให้ร้าน ผู้ให้บริการชำระเงิน และหน่วยงานที่เกี่ยวข้องเพื่อการตรวจสอบ</span>
                </label>

                {!otpSessionId && (
                  <button className="stoppay-primary" disabled={!canRequestOtp || sendingOtp} onClick={requestOtp}>
                    <Phone /> {sendingOtp ? "กำลังส่ง OTP..." : "ส่ง OTP เพื่อยืนยันเบอร์"}
                  </button>
                )}

                {otpSessionId && !otpVerifiedToken && (
                  <div className="stoppay-otp">
                    <div><KeyRound /><span><b>กรอกรหัส OTP</b><small>{otpReference ? "Ref: " + otpReference : "ส่งรหัสไปยังเบอร์ที่ระบุแล้ว"}</small></span></div>
                    <input inputMode="numeric" maxLength={8} value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))} placeholder="OTP" />
                    <button className="stoppay-secondary" disabled={verifyingOtp || otpCode.length < 4} onClick={verifyOtp}>{verifyingOtp ? "กำลังตรวจสอบ..." : "ยืนยัน OTP"}</button>
                  </div>
                )}

                {otpVerifiedToken && (
                  <div className="stoppay-final">
                    <div className="stoppay-info green"><BadgeCheck /><span><b>ยืนยันเบอร์มือถือสำเร็จ</b><small>ตรวจข้อมูลอีกครั้งก่อนกด STOPPAY</small></span></div>
                    <button className="stoppay-danger" disabled={submitting} onClick={submitStopPay}>
                      <ShieldAlert /> {submitting ? "กำลังส่ง STOPPAY..." : "STOPPAY รายการนี้"}
                    </button>
                  </div>
                )}
              </section>
            )}

            {caseResult && (
              <section className="stoppay-card stoppay-success">
                <div className="stoppay-success-icon"><FileCheck2 /></div>
                <small>STOPPAY RECEIVED</small>
                <h2>รับเรื่องเรียบร้อย</h2>
                <p>ระบบแจ้งร้านให้ติดต่อผู้แจ้งตามเบอร์ที่ยืนยันไว้ ภายใน 48 ชั่วโมง</p>
                <div className="stoppay-case-number"><span>เลขเคส</span><b>{caseResult.caseNumber}</b></div>
                {caseResult.deadline && <div className="stoppay-info amber"><Clock3 /><span><b>กำหนดให้ร้านติดต่อภายใน</b><small>{formatDate(caseResult.deadline + (caseResult.deadline.includes("T") ? "" : "Z"))}</small></span></div>}
                <div className="stoppay-info blue"><ShieldAlert /><span><b>ถ้าร้านไม่ติดต่อภายใน 48 ชั่วโมง</b><small>กลับมาที่ “ติดตามหลัง 48 ชม.” ยืนยัน OTP อีกครั้ง เพื่อส่งคำขอคืนเงินเข้าตรวจสอบ ระบบจะระงับการถอนของร้านระหว่างตรวจสอบ</small></span></div>
                <button className="stoppay-primary" onClick={() => setTab("track")}>ติดตามเคสนี้</button>
                <button className="stoppay-link" onClick={reset}>แจ้งรายการอื่น</button>
              </section>
            )}

            {error && <div className="stoppay-error"><AlertTriangle /> <span>{error}</span></div>}
          </>
        ) : (
          <section className="stoppay-card">
            <div className="stoppay-card-head">
              <span><Clock3 /></span>
              <div><h2>ติดตามหลัง 48 ชั่วโมง</h2><p>กรณีร้านยังไม่ติดต่อ ให้ยืนยันตัวตนอีกครั้งก่อนส่งคำขอคืนเงินเข้าตรวจสอบ</p></div>
            </div>

            <div className="stoppay-field-row">
              <label><span>เลขเคส STOPPAY</span><input value={trackCase} onChange={(e) => setTrackCase(e.target.value.toUpperCase())} placeholder="SP-20261005-XXXXXXXX" /></label>
              <label><span>เบอร์มือถือผู้แจ้ง</span><input inputMode="tel" value={trackPhone} onChange={(e) => setTrackPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="08xxxxxxxx" /></label>
            </div>
            <label><span>ชื่อผู้แจ้ง</span><input value={trackName} onChange={(e) => setTrackName(e.target.value)} placeholder="ชื่อ-นามสกุล" /></label>

            {!trackOtpSession && (
              <button className="stoppay-primary" disabled={trackBusy || !trackCase || trackPhone.length !== 10 || trackName.trim().length < 2} onClick={prepareTrack}>
                <Search /> {trackBusy ? "กำลังตรวจสอบ..." : "ตรวจสอบสถานะเคส"}
              </button>
            )}

            {trackOtpSession && !trackDone && (
              <div className="stoppay-otp">
                <div><KeyRound /><span><b>ยืนยัน OTP อีกครั้ง</b><small>{trackOtpRef ? "Ref: " + trackOtpRef : "เพื่อยืนยันว่าเป็นเจ้าของเคส"}</small></span></div>
                <input inputMode="numeric" value={trackOtp} onChange={(e) => setTrackOtp(e.target.value.replace(/\D/g, ""))} placeholder="OTP" />
                <button className="stoppay-danger" disabled={trackBusy || trackOtp.length < 4} onClick={confirmTrack}>
                  <ShieldAlert /> {trackBusy ? "กำลังส่งเรื่อง..." : "ยืนยันและส่งคำขอคืนเงินเข้าตรวจสอบ"}
                </button>
              </div>
            )}

            {trackMessage && <div className={"stoppay-info " + (trackDone ? "green" : "blue")}><CheckCircle2 /><span><b>{trackDone ? "ดำเนินการแล้ว" : "สถานะเคส"}</b><small>{trackMessage}</small></span></div>}
          </section>
        )}

        <section className="stoppay-policy">
          <h3>หลักการ STOPPAY</h3>
          <div><b>ภายใน 24 ชม.</b><span>รับแจ้งเฉพาะรายการล่าสุด เพื่อให้ตรวจสอบได้ทันเวลา</span></div>
          <div><b>ร้านมี 48 ชม.</b><span>ร้านได้รับข้อมูลผู้แจ้งเพื่อโทรติดต่อและชี้แจง</span></div>
          <div><b>ไม่ใช่ปุ่มคืนเงินทันที</b><span>กรณีครบ 48 ชั่วโมงโดยไม่ติดต่อ ระบบจะระงับการถอนและส่งเรื่องคืนเงินเข้าตรวจสอบเมื่อผู้จ่ายกลับมายืนยันอีกครั้ง</span></div>
        </section>
      </main>
    </div>
  );
}
