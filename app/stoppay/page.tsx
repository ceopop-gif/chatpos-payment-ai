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
  };
  match?: Match;
};

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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [identitySessionId, setIdentitySessionId] = useState("");
  const [identityReference, setIdentityReference] = useState("");
  const [identityOtp, setIdentityOtp] = useState("");
  const [identityToken, setIdentityToken] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const [slip, setSlip] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualAmount, setManualAmount] = useState("");
  const [manualPaidAt, setManualPaidAt] = useState("");
  const [manualReference, setManualReference] = useState("");
  const [match, setMatch] = useState<Match | null>(null);

  const [reasonCode, setReasonCode] = useState("fraud");
  const [reasonDetail, setReasonDetail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [caseResult, setCaseResult] = useState<{ caseNumber: string; heldAmount: number } | null>(null);
  const [error, setError] = useState("");

  const identityReady = useMemo(
    () => firstName.trim().length >= 2 && lastName.trim().length >= 2 && /^0\d{9}$/.test(phone),
    [firstName, lastName, phone],
  );

  const canSubmit = Boolean(
    identityToken &&
    match &&
    slip &&
    accepted &&
    reasonDetail.trim().length >= 5,
  );

  const requestIdentityOtp = async () => {
    if (!identityReady) return;
    setSendingOtp(true);
    setError("");
    try {
      const response = await fetch("/api/stoppay/identity/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone }),
      });
      const payload = await response.json() as { sessionId?: string; referenceCode?: string; error?: string };
      if (!response.ok || !payload.sessionId) throw new Error(payload.error || "ส่ง OTP ไม่สำเร็จ");
      setIdentitySessionId(payload.sessionId);
      setIdentityReference(payload.referenceCode || "");
      setIdentityOtp("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ส่ง OTP ไม่สำเร็จ");
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyIdentityOtp = async () => {
    if (!identitySessionId || identityOtp.length < 4) return;
    setVerifyingOtp(true);
    setError("");
    try {
      const response = await fetch("/api/stoppay/identity/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: identitySessionId, otpCode: identityOtp }),
      });
      const payload = await response.json() as { identityToken?: string; error?: string };
      if (!response.ok || !payload.identityToken) throw new Error(payload.error || "OTP ไม่ถูกต้อง");
      setIdentityToken(payload.identityToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ยืนยัน OTP ไม่สำเร็จ");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const chooseSlip = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSlip(file);
    setMatch(null);
    setManualMode(false);
    setError("");
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setSlipPreview(file ? URL.createObjectURL(file) : "");
  };

  const analyze = async (manual = false) => {
    if (!identityToken) {
      setError("กรุณายืนยันชื่อ นามสกุล และเบอร์มือถือด้วย OTP ก่อน");
      return;
    }
    if (!slip) {
      setError("กรุณาเลือกรูปสลิปก่อน");
      return;
    }

    setAnalyzing(true);
    setError("");
    try {
      const form = new FormData();
      form.set("identityToken", identityToken);
      form.set("slip", slip);
      if (manual) {
        form.set("amount", manualAmount);
        form.set("paidAt", manualPaidAt);
        form.set("slipReference", manualReference);
      }
      const response = await fetch("/api/stoppay/analyze", { method: "POST", body: form });
      const payload = await response.json() as AnalyzePayload;
      if (response.status === 401) {
        setIdentityToken("");
        setIdentitySessionId("");
      }
      if (!response.ok) throw new Error(payload.error || "ตรวจสลิปไม่สำเร็จ");

      if (payload.needsManual) {
        setManualMode(true);
        if (payload.extracted?.amount) setManualAmount(String(payload.extracted.amount));
        if (payload.extracted?.transactionReference) setManualReference(payload.extracted.transactionReference);
        throw new Error(payload.reason || "กรุณากรอกยอดและวันเวลาจากสลิป");
      }

      if (!payload.match) throw new Error("ไม่พบรายการที่ตรงกับสลิป");
      setMatch(payload.match);
      setManualMode(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ตรวจสลิปไม่สำเร็จ");
    } finally {
      setAnalyzing(false);
    }
  };

  const submitStopPay = async () => {
    if (!canSubmit || !match || !slip) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.set("identityToken", identityToken);
      form.set("lookupToken", match.lookupToken);
      form.set("reasonCode", reasonCode);
      form.set("reasonDetail", reasonDetail);
      form.set("declarationAccepted", "true");
      form.set("slip", slip);

      const response = await fetch("/api/stoppay/cases", { method: "POST", body: form });
      const payload = await response.json() as {
        caseNumber?: string;
        heldAmount?: number;
        error?: string;
      };
      if (response.status === 401) {
        setIdentityToken("");
        setIdentitySessionId("");
      }
      if (!response.ok || !payload.caseNumber) throw new Error(payload.error || "สร้าง STOPPAY ไม่สำเร็จ");

      setCaseResult({
        caseNumber: payload.caseNumber,
        heldAmount: Number(payload.heldAmount ?? match.amount),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "สร้าง STOPPAY ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setSlip(null);
    setSlipPreview("");
    setMatch(null);
    setManualMode(false);
    setManualAmount("");
    setManualPaidAt("");
    setManualReference("");
    setReasonDetail("");
    setAccepted(false);
    setCaseResult(null);
    setError("");
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
            <h1>STOPPAY แจ้งและตรวจสอบรายการ</h1>
            <p>ยืนยันตัวตนด้วย OTP ก่อนตรวจสลิปและแจ้งหยุดยอดรายการที่มีปัญหา</p>
          </div>
        </section>

        {!caseResult && (
          <>
            <section className="stoppay-card">
              <div className="stoppay-card-head">
                <span>1</span>
                <div><h2>ยืนยันผู้แจ้ง</h2><p>กรอกชื่อ นามสกุล และเบอร์มือถือ แล้วขอรหัส OTP ก่อนใช้งาน STOPPAY</p></div>
              </div>

              <div className="stoppay-field-row">
                <label><span><User /> ชื่อ</span><input value={firstName} disabled={Boolean(identityToken)} onChange={(e) => setFirstName(e.target.value)} placeholder="ชื่อ" /></label>
                <label><span><User /> นามสกุล</span><input value={lastName} disabled={Boolean(identityToken)} onChange={(e) => setLastName(e.target.value)} placeholder="นามสกุล" /></label>
              </div>
              <label><span><Phone /> เบอร์มือถือ</span><input inputMode="tel" value={phone} disabled={Boolean(identityToken)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="08xxxxxxxx" /></label>

              {!identitySessionId && !identityToken && (
                <button className="stoppay-primary" disabled={!identityReady || sendingOtp} onClick={requestIdentityOtp}>
                  <Phone /> {sendingOtp ? "กำลังส่ง OTP..." : "ขอรหัส OTP เพื่อแจ้งและตรวจสอบ"}
                </button>
              )}

              {identitySessionId && !identityToken && (
                <div className="stoppay-otp">
                  <div><KeyRound /><span><b>กรอกรหัส OTP</b><small>{identityReference ? "Ref: " + identityReference : "ส่งรหัสไปยังเบอร์ที่ระบุแล้ว"}</small></span></div>
                  <input inputMode="numeric" maxLength={8} value={identityOtp} onChange={(e) => setIdentityOtp(e.target.value.replace(/\D/g, ""))} placeholder="OTP" />
                  <button className="stoppay-secondary" disabled={verifyingOtp || identityOtp.length < 4} onClick={verifyIdentityOtp}>
                    {verifyingOtp ? "กำลังตรวจสอบ..." : "ยืนยัน OTP"}
                  </button>
                </div>
              )}

              {identityToken && (
                <div className="stoppay-info green">
                  <BadgeCheck />
                  <span><b>ยืนยันตัวตนสำเร็จ</b><small>{firstName} {lastName} · {phone}</small></span>
                </div>
              )}
            </section>

            {identityToken && (
              <section className="stoppay-card">
                <div className="stoppay-card-head">
                  <span>2</span>
                  <div><h2>ส่งสลิปและค้นหาร้าน</h2><p>ระบบอ่านยอด วันเวลา และค้นหารายการรับเงินที่ตรงกันภายใน 24 ชั่วโมง</p></div>
                </div>

                <label className={"stoppay-upload " + (slipPreview ? "has-image" : "")}>
                  {slipPreview ? <img src={slipPreview} alt="สลิปที่เลือก" /> : <><UploadCloud /><strong>เลือกรูปสลิป</strong><small>JPG / PNG / WEBP ไม่เกิน 6 MB</small></>}
                  <input type="file" accept="image/*" onChange={chooseSlip} />
                </label>

                {!match && (
                  <button className="stoppay-primary" disabled={!slip || analyzing} onClick={() => analyze(false)}>
                    {analyzing ? <><RefreshCw className="spin" /> กำลังตรวจสอบ...</> : <><Search /> ตรวจสลิปและค้นหาร้าน</>}
                  </button>
                )}

                {manualMode && !match && (
                  <div className="stoppay-manual">
                    <div className="stoppay-info amber"><AlertTriangle /><span><b>กรอกข้อมูลจากสลิป</b><small>ใช้เมื่อระบบอ่านภาพอัตโนมัติไม่ครบ</small></span></div>
                    <label><span>ยอดเงิน (บาท)</span><input inputMode="decimal" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="เช่น 1.00" /></label>
                    <label><span>วันและเวลาชำระ</span><input type="datetime-local" value={manualPaidAt} onChange={(e) => setManualPaidAt(e.target.value)} /></label>
                    <label><span>เลขที่รายการ (ถ้ามี)</span><input value={manualReference} onChange={(e) => setManualReference(e.target.value)} placeholder="เลขที่รายการจากสลิป" /></label>
                    <button className="stoppay-secondary" disabled={!manualAmount || !manualPaidAt || analyzing} onClick={() => analyze(true)}><Search /> ค้นหารายการ</button>
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

            {identityToken && match && (
              <section className="stoppay-card">
                <div className="stoppay-card-head">
                  <span>3</span>
                  <div><h2>แจ้งเหตุและกด STOPPAY</h2><p>เมื่อยืนยัน ระบบจะส่งคำร้องเข้า Team และล็อกยอดรายการนี้ทันที</p></div>
                </div>

                <label className="stoppay-select-label">
                  <span>เหตุผลที่แจ้ง</span>
                  <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                    <option value="fraud">ถูกหลอกให้โอนเงิน / สงสัยถูกโกง</option>
                    <option value="not_received">ไม่ได้รับสินค้า หรือไม่ได้รับบริการ</option>
                    <option value="service_not_as_agreed">สินค้า/บริการไม่ตรงตามที่ตกลงอย่างมีนัยสำคัญ</option>
                    <option value="other">เหตุอื่นที่ต้องการให้เจ้าหน้าที่ตรวจสอบ</option>
                  </select>
                </label>

                <label className="stoppay-detail">
                  <span>อธิบายว่าเกิดอะไรขึ้น</span>
                  <textarea value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} rows={5} maxLength={2000} placeholder="อธิบายเหตุการณ์และสิ่งที่ต้องการให้เจ้าหน้าที่ตรวจสอบ..." />
                </label>

                <div className="stoppay-warning">
                  <AlertTriangle />
                  <div>
                    <b>ห้ามแจ้ง STOPPAY โดยไม่ถูกต้อง</b>
                    <p>ห้ามใช้กรณีได้รับสินค้า/บริการแล้วแต่กลับมาแจ้งเพื่อเอาเงินคืน หรือแจ้งข้อมูลเท็จ ต้องเป็นกรณีมีเหตุอันควรเชื่อว่าถูกโกง ไม่ได้รับสินค้า/บริการ หรือมีข้อพิพาทจริงเท่านั้น</p>
                  </div>
                </div>

                <label className="stoppay-consent">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                  <span>ข้าพเจ้ายืนยันว่าข้อมูลทั้งหมดเป็นความจริง ยินยอมให้ ChatPOS เก็บข้อมูลคำร้องและส่งข้อมูลที่จำเป็นให้เจ้าหน้าที่ Team ตรวจสอบ หากตรวจพบว่าแจ้งเท็จหรือใช้ STOPPAY โดยไม่สุจริต ยินยอมให้ยกเลิกคำร้องและดำเนินการตามเงื่อนไขของระบบ</span>
                </label>

                <div className="stoppay-info amber">
                  <Clock3 />
                  <span><b>เมื่อกด STOPPAY ยอดนี้จะถูกล็อกทันที</b><small>เมื่อครบ 24 ชั่วโมง ยอดนี้จะยังไม่เข้าสู่ยอดพร้อมถอน จนกว่าเจ้าหน้าที่ Team จะยกเลิก STOPPAY</small></span>
                </div>

                <button className="stoppay-danger" disabled={!canSubmit || submitting} onClick={submitStopPay}>
                  <ShieldAlert /> {submitting ? "กำลังส่ง STOPPAY..." : "STOPPAY รายการนี้"}
                </button>
              </section>
            )}
          </>
        )}

        {caseResult && (
          <section className="stoppay-card stoppay-success">
            <div className="stoppay-success-icon"><FileCheck2 /></div>
            <small>STOPPAY RECEIVED</small>
            <h2>ส่งเรื่องให้ Team แล้ว</h2>
            <p>ยอดรายการนี้ถูกล็อกแล้วและจะไม่เข้าสู่ยอดพร้อมถอน แม้รายการจะครบ 24 ชั่วโมง จนกว่าเจ้าหน้าที่จะตรวจสอบและยกเลิก STOPPAY</p>
            <div className="stoppay-case-number"><span>เลขเคส</span><b>{caseResult.caseNumber}</b></div>
            <div className="stoppay-info amber"><ShieldAlert /><span><b>ยอดที่ล็อก ฿{money.format(caseResult.heldAmount)}</b><small>สถานะ: รอเจ้าหน้าที่ Team ตรวจสอบ</small></span></div>
            <button className="stoppay-primary" onClick={reset}>ตรวจรายการอื่น</button>
          </section>
        )}

        {error && <div className="stoppay-error"><AlertTriangle /><span>{error}</span></div>}

        <section className="stoppay-policy">
          <h3>หลักการ STOPPAY</h3>
          <div><b>ยืนยัน OTP ก่อน</b><span>ผู้แจ้งต้องกรอกชื่อ นามสกุล และเบอร์มือถือเพื่อยืนยันตัวตนก่อนตรวจสอบ</span></div>
          <div><b>ภายใน 24 ชม.</b><span>ระบบค้นหารายการล่าสุดและล็อกยอดที่แจ้ง ไม่ให้กลายเป็นยอดพร้อมถอน</span></div>
          <div><b>Team เป็นผู้ปลด</b><span>ยอดจะถูกล็อกจนกว่าเจ้าหน้าที่ Team จะตรวจสอบและกดยกเลิก STOPPAY</span></div>
        </section>
      </main>
    </div>
  );
}
