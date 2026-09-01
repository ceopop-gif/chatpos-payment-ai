"use client";

import { useDeferredValue, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  KeyRound,
  LocateFixed,
  MapPin,
  Phone,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";

type RegistrationForm = {
  phone: string;
  firstName: string;
  lastName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  mapUrl: string;
  businessDescription: string;
  agentReference: string;
  password: string;
  confirmPassword: string;
  consent: boolean;
};

type RegistrationResult = {
  applicationNumber: string;
  status: string;
  submittedAt: string;
};

const initialForm: RegistrationForm = {
  phone: "",
  firstName: "",
  lastName: "",
  address: "",
  latitude: null,
  longitude: null,
  accuracy: null,
  mapUrl: "",
  businessDescription: "",
  agentReference: "",
  password: "",
  confirmPassword: "",
  consent: false,
};

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("66") && digits.length === 11 ? "0" + digits.slice(2) : digits;
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RegistrationForm>(initialForm);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const requestIdRef = useRef("");
  const deferredAddress = useDeferredValue(form.address.trim());
  const mapPreviewQuery = form.latitude !== null && form.longitude !== null
    ? form.latitude + "," + form.longitude
    : deferredAddress || "กรุงเทพมหานคร ประเทศไทย";
  const mapPreviewUrl = "https://www.google.com/maps?q=" + encodeURIComponent(mapPreviewQuery)
    + "&z=" + (form.latitude !== null ? "17" : "14") + "&output=embed";
  const fullMapUrl = form.latitude !== null && form.longitude !== null
    ? "https://www.google.com/maps?q=" + form.latitude + "," + form.longitude
    : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapPreviewQuery);

  const setField = <K extends keyof RegistrationForm>(key: K, value: RegistrationForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const validateStep = (targetStep: number) => {
    if (targetStep === 1) {
      const phone = normalizedPhone(form.phone);
      if (!/^0[689]\d{8}$/.test(phone)) return "กรุณากรอกเบอร์มือถือ 10 หลักให้ถูกต้อง";
      if (form.firstName.trim().length < 2) return "กรุณากรอกชื่อ";
      if (form.lastName.trim().length < 2) return "กรุณากรอกนามสกุล";
    }
    if (targetStep === 2) {
      if (form.address.trim().length < 10) return "กรุณากรอกที่อยู่ร้านให้ครบถ้วน";
      const hasCoordinates = form.latitude !== null && form.longitude !== null;
      const hasMapLink = /^https?:\/\//i.test(form.mapUrl.trim());
      if (!hasCoordinates && !hasMapLink) return "กรุณาปักหมุดร้าน หรือวางลิงก์ Google Maps";
    }
    if (targetStep === 3) {
      if (form.businessDescription.trim().length < 5) return "กรุณาอธิบายว่าร้านขายสินค้าหรือบริการอะไร";
      if (form.password.length < 8 || form.password.length > 128 || !/\d/.test(form.password) || !/[^\d\s]/u.test(form.password)) {
        return "รหัสผ่านต้องมีอย่างน้อย 8 ตัว และมีทั้งตัวอักษรกับตัวเลข";
      }
      if (form.password !== form.confirmPassword) return "รหัสผ่านทั้ง 2 ช่องไม่ตรงกัน";
      if (!form.consent) return "กรุณายืนยันข้อมูลและยินยอมให้ทีมงานติดต่อกลับ";
    }
    return "";
  };

  const nextStep = () => {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setStep((current) => Math.min(3, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const previousStep = () => {
    setError("");
    setStep((current) => Math.max(1, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const captureLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocationMessage("อุปกรณ์นี้ไม่รองรับตำแหน่ง กรุณาวางลิงก์ Google Maps ด้านล่าง");
      return;
    }
    setLocating(true);
    setLocationMessage("กำลังค้นหาตำแหน่งร้าน...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy);
        setForm((current) => ({
          ...current,
          latitude,
          longitude,
          accuracy,
          mapUrl: "https://www.google.com/maps?q=" + latitude + "," + longitude,
        }));
        setLocationMessage("ปักหมุดร้านเรียบร้อยแล้ว");
        setError("");
        setLocating(false);
      },
      () => {
        setLocationMessage("ไม่สามารถเข้าถึงตำแหน่งได้ กรุณาเปิดสิทธิ์ตำแหน่งหรือวางลิงก์ Google Maps");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const submitRegistration = async (event: FormEvent) => {
    event.preventDefault();
    const message = validateStep(3);
    if (message) {
      setError(message);
      return;
    }
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: normalizedPhone(form.phone),
          username: normalizedPhone(form.phone),
          clientRequestId: requestIdRef.current,
        }),
      });
      const payload = await response.json() as { registration?: RegistrationResult; error?: string };
      if (!response.ok || !payload.registration) throw new Error(payload.error || "ส่งใบสมัครไม่สำเร็จ");
      setResult(payload.registration);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ส่งใบสมัครไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const resetRegistration = () => {
    setForm(initialForm);
    setStep(1);
    setResult(null);
    setError("");
    setLocationMessage("");
    setShowPasswords(false);
    requestIdRef.current = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (result) {
    return (
      <div className="register-shell">
        <main className="register-success">
          <span className="register-success-icon"><CheckCircle2 /></span>
          <small>CHATPOS MERCHANT</small>
          <h1>ส่งใบสมัครเรียบร้อยแล้ว</h1>
          <p>ทีมงานได้รับข้อมูลของคุณแล้ว และจะติดต่อกลับทางเบอร์โทรศัพท์ที่ลงทะเบียนไว้</p>

          <section className="register-reference">
            <ClipboardCheck />
            <span><small>เลขที่ใบสมัคร</small><strong>{result.applicationNumber}</strong></span>
          </section>

          <section className="register-success-summary">
            <div><Smartphone /><span><small>Username / เบอร์มือถือ</small><strong>{normalizedPhone(form.phone)}</strong></span></div>
            <div><UserRound /><span><small>ผู้สมัคร</small><strong>{form.firstName.trim()} {form.lastName.trim()}</strong></span></div>
            <div><MapPin /><span><small>ที่ตั้งร้าน</small><strong>บันทึกหมุดและที่อยู่แล้ว</strong></span></div>
          </section>

          <div className="register-success-note"><ShieldCheck /><span><strong>กรุณาบันทึกเลขที่ใบสมัคร</strong><small>ใช้สำหรับติดต่อสอบถามและตรวจสอบข้อมูลกับทีมงาน</small></span></div>
          <button type="button" className="register-home-button" onClick={() => window.location.assign("/login")}><KeyRound /> เข้าสู่ระบบ</button>
          <button type="button" className="register-reset-button" onClick={resetRegistration}><RotateCcw /> สมัครร้านอื่น</button>
        </main>
      </div>
    );
  }

  return (
    <div className="register-shell">
      <header className="register-header">
        <button type="button" onClick={() => window.location.assign("/login")} aria-label="กลับหน้าเข้าสู่ระบบ"><ArrowLeft /></button>
        <span><small>CHATPOS MERCHANT</small><strong>สมัครใช้งาน</strong></span>
        <b><Sparkles /> ง่าย 3 ขั้นตอน</b>
      </header>

      <main className="register-main">
        <section className="register-hero">
          <span><Store /></span>
          <div>
            <small>เปิดร้านกับ ChatPOS</small>
            <h1>สมัครง่าย ใช้เวลาไม่นาน</h1>
            <p>กรอกข้อมูลร้านและตำแหน่ง เพื่อให้ทีมงานช่วยเปิดระบบให้เหมาะกับร้านของคุณ</p>
          </div>
        </section>

        <nav className="register-steps" aria-label="ขั้นตอนสมัคร">
          {[1, 2, 3].map((number) => (
            <div key={number} className={step === number ? "active" : step > number ? "done" : ""}>
              <span>{step > number ? <Check /> : number}</span>
              <small>{number === 1 ? "ผู้สมัคร" : number === 2 ? "ที่ตั้งร้าน" : "ข้อมูลร้าน"}</small>
            </div>
          ))}
        </nav>

        <form className="register-card" onSubmit={submitRegistration} noValidate>
          {step === 1 && (
            <section className="register-stage">
              <header><span><Phone /></span><div><small>ขั้นตอนที่ 1</small><h2>ข้อมูลผู้สมัคร</h2><p>เริ่มด้วยเบอร์โทรที่ทีมงานสามารถติดต่อได้</p></div></header>
              <label className="register-field">
                <span>เบอร์มือถือ <b>*</b></span>
                <div><Phone /><input type="tel" inputMode="tel" autoComplete="tel" maxLength={12} placeholder="เช่น 0812345678" value={form.phone} onChange={(event) => setField("phone", event.target.value.replace(/[^\d+\-\s]/g, ""))} /></div>
              </label>
              <div className="register-name-grid">
                <label className="register-field">
                  <span>ชื่อ <b>*</b></span>
                  <div><UserRound /><input type="text" autoComplete="given-name" maxLength={80} placeholder="ชื่อจริง" value={form.firstName} onChange={(event) => setField("firstName", event.target.value)} /></div>
                </label>
                <label className="register-field">
                  <span>นามสกุล <b>*</b></span>
                  <div><UserRound /><input type="text" autoComplete="family-name" maxLength={80} placeholder="นามสกุล" value={form.lastName} onChange={(event) => setField("lastName", event.target.value)} /></div>
                </label>
              </div>
              <label className="register-field register-agent-reference">
                <span>เบอร์มือถือหรือรหัสตัวแทน</span>
                <div><ShieldCheck /><input type="text" inputMode="text" maxLength={24} placeholder="เช่น 0891234567 หรือ AGENT001" value={form.agentReference} onChange={(event) => setField("agentReference", event.target.value.toUpperCase().replace(/[^A-Z0-9+\-\s]/g, ""))} /></div>
                <small>ถ้ามีตัวแทน ร้านจะถูกผูกเข้ากับตัวแทนรายนั้นทันที หากยังไม่มีสามารถให้หลังบ้านผูกก่อนอนุมัติ KYC ได้</small>
              </label>
            </section>
          )}

          {step === 2 && (
            <section className="register-stage">
              <header><span><MapPin /></span><div><small>ขั้นตอนที่ 2</small><h2>ที่อยู่และหมุดร้าน</h2><p>ช่วยให้ทีมงานตรวจสอบพื้นที่และให้บริการได้ถูกต้อง</p></div></header>
              <label className="register-field register-textarea">
                <span>ที่อยู่ร้าน <b>*</b></span>
                <textarea autoComplete="street-address" maxLength={600} rows={4} placeholder="เลขที่ หมู่บ้าน ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์" value={form.address} onChange={(event) => setField("address", event.target.value)} />
              </label>
              <section className="register-map-preview">
                <header>
                  <span><MapPin /> Google Maps ร้านของคุณ</span>
                  <a href={fullMapUrl} target="_blank" rel="noreferrer">เปิดเต็มจอ <ArrowRight /></a>
                </header>
                <div>
                  <iframe
                    key={mapPreviewUrl}
                    title="Google Maps ตำแหน่งร้าน"
                    src={mapPreviewUrl}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <p>{form.latitude !== null ? "แผนที่แสดงหมุดจากตำแหน่งปัจจุบันของร้าน" : form.address.trim() ? "แผนที่ค้นหาจากที่อยู่ร้านที่กรอก" : "กรอกที่อยู่หรือกดใช้ตำแหน่งปัจจุบันเพื่อแสดงหมุดร้าน"}</p>
              </section>
              <section className={form.latitude !== null && form.longitude !== null ? "register-location ready" : "register-location"}>
                <div className="register-location-icon"><LocateFixed /></div>
                <div><strong>{form.latitude !== null ? "ปักหมุดร้านแล้ว" : "ปักหมุดตำแหน่งร้าน"}</strong><p>{locationMessage || "ยืนอยู่ที่ร้านแล้วกดปุ่มด้านล่าง ระบบจะบันทึกตำแหน่งให้อัตโนมัติ"}</p></div>
                <button type="button" disabled={locating} onClick={captureLocation}><MapPin /> {locating ? "กำลังค้นหา..." : form.latitude !== null ? "ปักหมุดใหม่" : "ใช้ตำแหน่งปัจจุบัน"}</button>
                {form.latitude !== null && form.longitude !== null && (
                  <a href={form.mapUrl} target="_blank" rel="noreferrer">เปิดตรวจสอบหมุดบนแผนที่ <ArrowRight /></a>
                )}
              </section>
              <details className="register-map-fallback">
                <summary>ปักหมุดไม่ได้? วางลิงก์ Google Maps</summary>
                <label className="register-field">
                  <span>ลิงก์ตำแหน่งร้าน</span>
                  <div><MapPin /><input type="url" inputMode="url" maxLength={800} placeholder="https://maps.app.goo.gl/..." value={form.mapUrl} onChange={(event) => setField("mapUrl", event.target.value)} /></div>
                </label>
              </details>
            </section>
          )}

          {step === 3 && (
            <section className="register-stage">
              <header><span><Store /></span><div><small>ขั้นตอนที่ 3</small><h2>ร้านของคุณขายอะไร</h2><p>อธิบายสั้นๆ เพื่อให้ทีมงานเตรียมระบบได้ตรงกับธุรกิจ</p></div></header>
              <label className="register-field register-textarea">
                <span>รายละเอียดร้าน <b>*</b></span>
                <textarea maxLength={1000} rows={6} placeholder="เช่น ร้านอาหารตามสั่ง มี 12 โต๊ะ ต้องการรับออเดอร์ผ่าน QR และรับชำระเงินทุกช่องทาง" value={form.businessDescription} onChange={(event) => setField("businessDescription", event.target.value)} />
                <small>{form.businessDescription.length}/1,000 ตัวอักษร</small>
              </label>
              <section className="register-credentials">
                <header><span><KeyRound /></span><div><small>บัญชีเข้าสู่ระบบ</small><h3>ตั้ง Username และ Password</h3><p>Username ใช้เบอร์มือถือของผู้สมัครเท่านั้น</p></div></header>
                <label className="register-field register-username">
                  <span>Username</span>
                  <div><Smartphone /><input type="tel" autoComplete="username" readOnly aria-readonly="true" value={normalizedPhone(form.phone)} /></div>
                  <small>หากเบอร์ไม่ถูกต้อง ให้กดย้อนกลับไปแก้ในขั้นตอนที่ 1</small>
                </label>
                <label className="register-field">
                  <span>รหัสผ่าน <b>*</b></span>
                  <div className="register-password-input">
                    <KeyRound />
                    <input type={showPasswords ? "text" : "password"} autoComplete="new-password" maxLength={128} placeholder="อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข" value={form.password} onChange={(event) => setField("password", event.target.value)} />
                    <button type="button" onClick={() => setShowPasswords((current) => !current)} aria-label={showPasswords ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>{showPasswords ? <EyeOff /> : <Eye />}</button>
                  </div>
                </label>
                <label className="register-field">
                  <span>ยืนยันรหัสผ่าน <b>*</b></span>
                  <div className="register-password-input">
                    <KeyRound />
                    <input type={showPasswords ? "text" : "password"} autoComplete="new-password" maxLength={128} placeholder="กรอกรหัสผ่านเดิมอีกครั้ง" value={form.confirmPassword} onChange={(event) => setField("confirmPassword", event.target.value)} />
                    <button type="button" onClick={() => setShowPasswords((current) => !current)} aria-label={showPasswords ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>{showPasswords ? <EyeOff /> : <Eye />}</button>
                  </div>
                </label>
                <div className={form.confirmPassword && form.password === form.confirmPassword ? "register-password-hint matched" : "register-password-hint"}>
                  <ShieldCheck />
                  <span>{form.confirmPassword ? form.password === form.confirmPassword ? "รหัสผ่านทั้ง 2 ช่องตรงกัน" : "รหัสผ่านทั้ง 2 ช่องต้องตรงกัน" : "รหัสผ่านจะถูกเข้ารหัสก่อนบันทึก"}</span>
                </div>
              </section>
              <section className="register-review">
                <h3><ClipboardCheck /> ตรวจสอบก่อนส่ง</h3>
                <div><span>ผู้สมัคร</span><strong>{form.firstName.trim()} {form.lastName.trim()}</strong></div>
                <div><span>เบอร์โทร</span><strong>{normalizedPhone(form.phone)}</strong></div>
                <div><span>Username</span><strong>{normalizedPhone(form.phone)}</strong></div>
                <div><span>ตัวแทน</span><strong>{form.agentReference.trim() || "รอหลังบ้านผูกตัวแทน"}</strong></div>
                <div><span>ตำแหน่งร้าน</span><strong>{form.latitude !== null ? "ปักหมุดแล้ว" : "ใช้ลิงก์แผนที่"}</strong></div>
              </section>
              <label className="register-consent">
                <input type="checkbox" checked={form.consent} onChange={(event) => setField("consent", event.target.checked)} />
                <span><b>ยืนยันข้อมูลถูกต้อง</b> และยินยอมให้ ChatPOS ติดต่อกลับเพื่อดำเนินการสมัครใช้บริการ</span>
              </label>
            </section>
          )}

          {error && (
            <div className="register-error" role="alert">
              <strong>กรุณาตรวจสอบ</strong>
              <p>{error}</p>
              <small>ข้อมูลที่กรอกยังอยู่ครบ แก้ไขตามข้อความแล้วกดปุ่มอีกครั้ง</small>
            </div>
          )}

          <footer className="register-actions">
            {step > 1 && <button type="button" className="register-secondary" onClick={previousStep}><ArrowLeft /> ย้อนกลับ</button>}
            {step < 3 ? (
              <button type="button" className="register-primary" onClick={nextStep}>ถัดไป <ArrowRight /></button>
            ) : (
              <button type="submit" className="register-primary" disabled={submitting}><Send /> {submitting ? "กำลังส่งใบสมัคร..." : "ส่งใบสมัคร"}</button>
            )}
          </footer>
        </form>

        <p className="register-trust"><ShieldCheck /> ข้อมูลของคุณใช้สำหรับการสมัครบริการและการติดต่อกลับเท่านั้น</p>
      </main>
    </div>
  );
}
