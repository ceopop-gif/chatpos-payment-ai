"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, LogIn, ShieldCheck, Smartphone } from "lucide-react";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/login", { cache: "no-store" }).then((response) => {
      if (response.ok) window.location.replace("/admin");
      else setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || password.length < 5) {
      setError("กรุณากรอก Username และรหัสผ่านผู้ดูแล");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "เข้าสู่ระบบไม่สำเร็จ");
      window.location.replace("/admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เข้าสู่ระบบไม่สำเร็จ");
      setSubmitting(false);
    }
  };

  if (checking) return <div className="admin-login-shell admin-login-checking"><span><ShieldCheck /></span><strong>กำลังตรวจสอบสิทธิ์ผู้ดูแล</strong></div>;

  return (
    <div className="admin-login-shell">
      <main className="admin-login-card">
        <header><span><LockKeyhole /></span><small>CHATPOS CONTROL CENTER</small><h1>เข้าสู่ระบบหลังบ้าน</h1><p>สำหรับผู้ดูแลระบบ ตรวจ KYC จัดการตัวแทน และติดตามยอดร้านค้า</p></header>
        <form onSubmit={submit}>
          <label><span>Username ผู้ดูแล</span><div><Smartphone /><input value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} autoComplete="username" placeholder="กรอก Username" /></div></label>
          <label><span>รหัสผ่าน</span><div className="admin-password"><KeyRound /><input value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="กรอกรหัสผ่าน" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
          {error && <div className="admin-login-error" role="alert"><strong>เข้าสู่ระบบไม่ได้</strong><span>{error}</span></div>}
          <button className="admin-login-submit" disabled={submitting}><LogIn /> {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบหลังบ้าน"}</button>
        </form>
        <footer><ShieldCheck /> ระบบหลังบ้านแยกสิทธิ์จากบัญชีร้านค้า</footer>
      </main>
    </div>
  );
}
