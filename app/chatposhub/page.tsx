"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, LogOut, Plus, ShieldCheck, Store, Users } from "lucide-react";
import "./hub.css";

type HubGroup = {
  id: string;
  name: string;
  status: string;
  default_daily_limit_cents: number;
  created_at: string;
  member_count: number;
};

export default function ChatPosHubPage() {
  const [groups, setGroups] = useState<HubGroup[]>([]);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("50000");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/chatposhub/groups", { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace("/admin/login?returnTo=/chatposhub");
        return;
      }
      const payload = await response.json() as { groups?: HubGroup[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "โหลดกลุ่มไม่สำเร็จ");
      setGroups(payload.groups ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "โหลดกลุ่มไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const createGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setError("กรุณาตั้งชื่อกลุ่ม");
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/chatposhub/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), defaultDailyLimit: Number(limit) }),
      });
      const payload = await response.json() as { group?: { id: string }; error?: string };
      if (!response.ok || !payload.group) throw new Error(payload.error || "สร้างกลุ่มไม่สำเร็จ");
      window.location.href = `/chatposhub/group?groupId=${encodeURIComponent(payload.group.id)}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "สร้างกลุ่มไม่สำเร็จ");
      setSaving(false);
    }
  };

  return (
    <div className="hub-shell">
      <header className="hub-topbar">
        <div className="hub-brand"><b>Chat<span>POS</span></b><i /> <strong>Hub</strong></div>
        <a href="/admin" className="hub-top-link"><ShieldCheck /> Admin ใหญ่</a>
      </header>

      <main className="hub-home">
        <section className="hub-title">
          <div><Users /></div>
          <span><small>CHATPOS HUB</small><h1>จัดการกลุ่มร้านค้า</h1><p>สร้างกลุ่ม แล้วเพิ่มร้านที่ยกเลิก OTP และผ่าน KYC เข้ากลุ่ม</p></span>
        </section>

        <form className="hub-create-card" onSubmit={createGroup}>
          <div className="hub-card-heading"><Plus /><span><strong>สร้างกลุ่มใหม่</strong><small>Admin ใหญ่เป็นผู้สร้างกลุ่ม</small></span></div>
          <div className="hub-two-fields">
            <label><span>ชื่อกลุ่ม</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น กลุ่มร้านกรุงเทพ 01" /></label>
            <label><span>วงเงินร้านเริ่มต้น (บาท / วัน)</span><input value={limit} onChange={(event) => setLimit(event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /></label>
          </div>
          {error && <div className="hub-error">{error}</div>}
          <button className="hub-primary" disabled={saving}><Plus />{saving ? "กำลังสร้าง..." : "สร้างกลุ่ม"}</button>
        </form>

        <section className="hub-list-section">
          <div className="hub-section-head"><span><Store /><strong>กลุ่มที่ใช้งาน</strong></span><em>{groups.length} กลุ่ม</em></div>
          {loading ? <div className="hub-empty">กำลังโหลดกลุ่ม...</div> : groups.length === 0 ? (
            <div className="hub-empty">ยังไม่มีกลุ่ม กรอกชื่อด้านบนเพื่อสร้างกลุ่มแรก</div>
          ) : (
            <div className="hub-group-list">
              {groups.map((group) => (
                <a key={group.id} href={`/chatposhub/group?groupId=${encodeURIComponent(group.id)}`} className="hub-group-card">
                  <span className="hub-group-icon"><Users /></span>
                  <span className="hub-group-info"><strong>{group.name}</strong><small>{Number(group.member_count || 0).toLocaleString("th-TH")} ร้าน · วงเงินเริ่มต้น {(group.default_daily_limit_cents / 100).toLocaleString("th-TH")} บาท/วัน</small></span>
                  <ChevronRight />
                </a>
              ))}
            </div>
          )}
        </section>

        <a href="/admin" className="hub-secondary"><LogOut />กลับ Admin ใหญ่</a>
      </main>
    </div>
  );
}
