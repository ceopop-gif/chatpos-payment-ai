"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  UserPlus,
} from "lucide-react";

function normalizeMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("66") && digits.length === 11 ? "0" + digits.slice(2) : digits;
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/login", { cache: "no-store" })
      .then((response) => {
        if (response.ok) window.location.replace("/");
        else if (active) setChecking(false);
      })
      .catch(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, []);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    const mobile = normalizeMobile(username);
    if (!/^0[689]\d{8}$/.test(mobile)) {
      setError("กรุณากรอก Username เป็นเบอร์มือถือ 10 หลักที่ใช้สมัคร");
      return;
    }
    if (password.length < 8) {
      setError("กรุณากรอกรหัสผ่านอย่างน้อย 8 ตัว");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: mobile, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "เข้าสู่ระบบไม่สำเร็จ");
      window.location.replace("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="login-shell login-checking">
        <span><ShieldCheck /></span>
        <strong>กำลังตรวจสอบบัญชี</strong>
        <small>กรุณารอสักครู่...</small>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <main className="login-card">
        <section className="login-brand">
          <span><Store /></span>
          <small><Sparkles /> CHATPOS MERCHANT</small>
          <h1>เข้าสู่ระบบร้านค้า</h1>
          <p>จัดการร้าน รับออเดอร์ และตรวจสอบรายการได้ในที่เดียว</p>
        </section>

        <form onSubmit={submitLogin} className="login-form">
          <label>
            <span>Username / เบอร์มือถือ</span>
            <div><Smartphone /><input value={username} onChange={(event) => { setUsername(event.target.value.replace(/\D/g, "").slice(0, 11)); setError(""); }} type="tel" inputMode="tel" autoComplete="username" placeholder="08XXXXXXXX" aria-label="Username เบอร์มือถือ" /></div>
            <small>ใช้เบอร์มือถือที่กรอกไว้ตอนสมัคร</small>
          </label>

          <label>
            <span>รหัสผ่าน</span>
            <div className="login-password"><KeyRound /><input value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="กรอกรหัสผ่าน" aria-label="รหัสผ่าน" /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>{showPassword ? <EyeOff /> : <Eye />}</button></div>
          </label>

          {error && <div className="login-error" role="alert"><strong>เข้าสู่ระบบไม่ได้</strong><p>{error}</p><small>ตรวจเบอร์มือถือและรหัสผ่านให้ตรงกับข้อมูลตอนสมัคร แล้วลองอีกครั้ง</small></div>}

          <button type="submit" className="login-submit" disabled={submitting}><LogIn /> {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
        </form>

        <div className="login-divider"><span>ยังไม่มีบัญชีใช่ไหม?</span></div>
        <button type="button" className="login-register" onClick={() => window.location.assign("/register")}><UserPlus /> สมัครใช้งานใหม่</button>
        <p className="login-trust"><ShieldCheck /> ระบบรักษาการเข้าสู่ระบบบนอุปกรณ์นี้อย่างปลอดภัย</p>
      </main>
    </div>
  );
}
