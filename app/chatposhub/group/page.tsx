"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Save, Search, Store, Trash2, Users } from "lucide-react";
import "../hub.css";

type MerchantLookup = {
  found: boolean;
  eligible: boolean;
  reason: string;
  merchant?: {
    id: string;
    phone: string;
    name: string;
    businessDescription: string;
    kycStatus: string;
    accountStatus: string;
  };
  currentGroup?: { id: string; name: string } | null;
};

type HubMember = {
  id: string;
  merchant_id: string;
  phone: string;
  daily_limit_cents: number;
  added_at: string;
  first_name: string;
  last_name: string;
  business_description: string;
  kyc_status: string;
};

type AuditRow = {
  action: string;
  phone: string | null;
  detail: string;
  actor: string;
  created_at: string;
};

type HubCandidate = {
  id: string;
  phone: string;
  first_name: string;
  last_name: string;
  business_description: string;
  kyc_status: string;
  otp_bypass: number;
  active_group_id: string | null;
  active_group_name: string | null;
};

type GroupPayload = {
  group: { id: string; name: string; status: string; default_daily_limit_cents: number; created_at: string };
  members: HubMember[];
  audit: AuditRow[];
  candidates: HubCandidate[];
};

const dt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });

function actionLabel(action: string) {
  return action === "member.added" ? "เพิ่มร้านเข้ากลุ่ม"
    : action === "member.removed" ? "นำร้านออกจากกลุ่ม"
    : action === "member.limit_changed" ? "แก้วงเงินร้าน"
    : action === "group.limit_changed" ? "แก้วงเงินทั้งกลุ่ม"
    : action === "group.created" ? "สร้างกลุ่ม"
    : action;
}

export default function ChatPosHubGroupPage() {
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState<GroupPayload | null>(null);
  const [tab, setTab] = useState<"merchants" | "settings" | "api" | "history">("merchants");
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<MerchantLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState("50000");
  const [memberLimitDrafts, setMemberLimitDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async (id: string) => {
    setError("");
    try {
      const response = await fetch(`/api/chatposhub/group?groupId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace("/admin/login?returnTo=" + encodeURIComponent(window.location.pathname + window.location.search));
        return;
      }
      const payload = await response.json() as GroupPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "โหลดกลุ่มไม่สำเร็จ");
      setData(payload);
      setLimit(String((payload.group.default_daily_limit_cents || 0) / 100));
      setMemberLimitDrafts(Object.fromEntries(payload.members.map((member) => [member.id, String(member.daily_limit_cents / 100)])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "โหลดกลุ่มไม่สำเร็จ");
    }
  };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("groupId") ?? "";
    setGroupId(id);
    if (id) void load(id);
    else setError("ไม่พบรหัสกลุ่ม");
  }, []);

  const checkMerchant = async (selectedPhone: string) => {
    const cleanPhone = selectedPhone.replace(/\D/g, "").slice(0, 10);
    setPhone(cleanPhone);
    setLookup(null);
    setError("");
    setSuccess("");
    if (!cleanPhone) return;
    setLookupLoading(true);
    try {
      const response = await fetch(`/api/chatposhub/lookup?groupId=${encodeURIComponent(groupId)}&phone=${encodeURIComponent(cleanPhone)}`, { cache: "no-store" });
      const payload = await response.json() as MerchantLookup & { error?: string };
      if (!response.ok && !payload.reason) throw new Error(payload.error || "ตรวจสอบเบอร์ไม่สำเร็จ");
      setLookup(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ตรวจสอบเบอร์ไม่สำเร็จ");
    } finally {
      setLookupLoading(false);
    }
  };

  const searchMerchant = async (event?: FormEvent) => {
    event?.preventDefault();
    await checkMerchant(phone);
  };

  const addMerchant = async () => {
    if (!lookup?.eligible || !lookup.merchant) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/chatposhub/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add_member", groupId, phone: lookup.merchant.phone }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "เพิ่มร้านไม่สำเร็จ");
      setSuccess(`เพิ่ม ${lookup.merchant.phone} เข้ากลุ่มแล้ว`);
      setPhone("");
      setLookup(null);
      await load(groupId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เพิ่มร้านไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const removeMerchant = async (member: HubMember) => {
    if (!window.confirm(`นำเบอร์ ${member.phone} ออกจากกลุ่มนี้หรือไม่?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/chatposhub/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove_member", groupId, memberId: member.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "นำร้านออกไม่สำเร็จ");
      setSuccess("นำร้านออกจากกลุ่มแล้ว เบอร์นี้สามารถเพิ่มเข้ากลุ่มอื่นได้");
      await load(groupId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "นำร้านออกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const saveGroupLimit = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/chatposhub/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_group_limit", groupId, dailyLimit: Number(limit) }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึกวงเงินไม่สำเร็จ");
      setSuccess("บันทึกวงเงินให้ทุกร้านเรียบร้อย");
      await load(groupId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกวงเงินไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const saveMemberLimit = async (member: HubMember) => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/chatposhub/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set_member_limit",
          groupId,
          memberId: member.id,
          dailyLimit: Number(memberLimitDrafts[member.id] ?? 0),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึกวงเงินไม่สำเร็จ");
      setSuccess(`บันทึกวงเงินของ ${member.phone} แล้ว`);
      await load(groupId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกวงเงินไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const memberCount = data?.members.length ?? 0;
  const sortedAudit = useMemo(() => data?.audit ?? [], [data?.audit]);
  const availableCandidates = useMemo(
    () => (data?.candidates ?? []).filter((candidate) => Number(candidate.otp_bypass) === 1 && !candidate.active_group_id),
    [data?.candidates],
  );
  const unavailableCandidates = useMemo(
    () => (data?.candidates ?? []).filter((candidate) => Number(candidate.otp_bypass) !== 1 || Boolean(candidate.active_group_id)),
    [data?.candidates],
  );

  return (
    <div className="hub-shell">
      <header className="hub-topbar">
        <div className="hub-brand"><b>Chat<span>POS</span></b><i /><strong>Hub</strong></div>
        <a href="/chatposhub" className="hub-top-link"><Users />จัดการกลุ่ม</a>
      </header>

      <main className="hub-group-main">
        <a href="/chatposhub" className="hub-back"><ArrowLeft />กลับหน้ารวมกลุ่ม</a>
        <section className="hub-title">
          <div><Store /></div>
          <span><small>CHATPOS HUB GROUP</small><h1>{data?.group.name ?? "กำลังโหลดกลุ่ม..."}</h1><p>{memberCount.toLocaleString("th-TH")} ร้านในกลุ่ม</p></span>
        </section>

        <nav className="hub-tabs">
          <button className={tab === "merchants" ? "active" : ""} onClick={() => setTab("merchants")}>ร้านและวงเงิน</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>ตั้งค่ารับเงิน</button>
          <button className={tab === "api" ? "active" : ""} onClick={() => setTab("api")}>API / Webhook</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>ประวัติรายการ</button>
        </nav>

        {error && <div className="hub-error">{error}</div>}
        {success && <div className="hub-success">{success}</div>}

        {tab === "merchants" && data && (
          <>
            <section className="hub-panel">
              <div className="hub-card-heading"><Save /><span><strong>กำหนดวงเงินร้านเท่ากัน (บาท / วัน)</strong><small>บันทึกครั้งเดียวจะใช้กับร้านที่อยู่ในกลุ่มนี้ทั้งหมด</small></span></div>
              <div className="hub-limit-row">
                <label><span>วงเงินต่อร้าน</span><input value={limit} onChange={(event) => setLimit(event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /></label>
                <button className="hub-primary" onClick={saveGroupLimit} disabled={saving}><Save />บันทึกทุกร้าน</button>
              </div>
              <p className="hub-help">วงเงินจริงจะถูกตรวจซ้ำฝั่งระบบ ไม่อนุญาตให้เพิ่มร้านซ้ำใน Hub หลายกลุ่มพร้อมกัน</p>
            </section>

            <section className="hub-panel">
              <div className="hub-card-heading"><Search /><span><strong>เลือกเบอร์ร้านเพื่อเข้ากลุ่ม</strong><small>แสดงเบอร์ที่ KYC ผ่าน ยกเลิก OTP แล้ว และยังไม่อยู่ Hub กลุ่มอื่น</small></span></div>

              <div className="hub-phone-picker">
                <label>
                  <span>เลือกเบอร์ร้านที่พร้อมเพิ่ม</span>
                  <select
                    value={phone}
                    onChange={(event) => void checkMerchant(event.target.value)}
                    disabled={lookupLoading || saving || availableCandidates.length === 0}
                  >
                    <option value="">{availableCandidates.length ? "— เลือกเบอร์ร้าน —" : "ไม่มีเบอร์ที่พร้อมเพิ่ม"}</option>
                    {availableCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.phone}>
                        {candidate.phone} · {[candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || candidate.business_description || "ร้านค้า"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="hub-phone-picker-count">
                  <strong>{availableCandidates.length.toLocaleString("th-TH")}</strong>
                  <span>เบอร์พร้อมเพิ่ม</span>
                </div>
              </div>

              {availableCandidates.length === 0 && (
                <div className="hub-empty hub-picker-empty">
                  <strong>ยังไม่มีเบอร์ที่พร้อมเพิ่มเข้ากลุ่ม</strong>
                  <span>เบอร์ต้องผ่าน KYC, ยกเลิก OTP แล้ว และต้องไม่อยู่ใน Hub กลุ่มอื่น</span>
                  <a href="/bypass" className="hub-outline">ไปหน้า “ยกเลิก OTP ร้านค้า”</a>
                </div>
              )}

              <details className="hub-manual-check">
                <summary>ค้นหาเบอร์อื่นเพื่อตรวจสอบสถานะ</summary>
                <form className="hub-search-form" onSubmit={searchMerchant}>
                  <label><span>เบอร์มือถือร้านค้า</span><input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="กรอกเบอร์มือถือ 10 หลัก" /></label>
                  <button className="hub-primary" disabled={lookupLoading}><Search />{lookupLoading ? "กำลังตรวจ..." : "ตรวจสอบเบอร์"}</button>
                </form>
              </details>

              {!lookup && availableCandidates.length > 0 && <div className="hub-empty" style={{ marginTop: 14 }}>เลือกเบอร์จากรายการด้านบนได้เลย</div>}

              {lookup && (
                <div className={`hub-lookup ${lookup.eligible ? "ok" : "bad"}`}>
                  <div className="hub-lookup-head">
                    <strong>{lookup.merchant?.name || lookup.merchant?.phone || "ผลการตรวจสอบ"}</strong>
                    <em>{lookup.eligible ? "พร้อมเพิ่ม" : "เพิ่มไม่ได้"}</em>
                  </div>
                  {lookup.merchant && (
                    <div className="hub-lookup-grid">
                      <div><small>เบอร์มือถือ</small><strong>{lookup.merchant.phone}</strong></div>
                      <div><small>KYC</small><strong>{lookup.merchant.kycStatus === "approved" ? "ผ่าน" : lookup.merchant.kycStatus}</strong></div>
                      <div><small>OTP</small><strong>{lookup.eligible || lookup.reason.includes("กลุ่ม") ? "ยกเลิกแล้ว" : "ยังใช้ OTP"}</strong></div>
                      <div><small>กลุ่มปัจจุบัน</small><strong>{lookup.currentGroup?.name || "ไม่มี"}</strong></div>
                    </div>
                  )}
                  <p className="hub-lookup-reason">{lookup.reason}</p>
                  {lookup.eligible && <button type="button" className="hub-primary" onClick={addMerchant} disabled={saving}><CheckCircle2 />{saving ? "กำลังบันทึก..." : "บันทึกเข้ากลุ่ม"}</button>}
                </div>
              )}

              {unavailableCandidates.length > 0 && (
                <details className="hub-unavailable-list">
                  <summary>ดูเบอร์ที่ยังเพิ่มไม่ได้ ({unavailableCandidates.length.toLocaleString("th-TH")})</summary>
                  <div>
                    {unavailableCandidates.slice(0, 100).map((candidate) => (
                      <button key={candidate.id} type="button" onClick={() => void checkMerchant(candidate.phone)}>
                        <span><strong>{candidate.phone}</strong><small>{[candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || candidate.business_description || "ร้านค้า"}</small></span>
                        <em>{candidate.active_group_name ? `อยู่กลุ่ม ${candidate.active_group_name}` : Number(candidate.otp_bypass) === 1 ? "ตรวจสอบอีกครั้ง" : "ยังใช้ OTP"}</em>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </section>

            <section className="hub-panel">
              <div className="hub-section-head"><span><Store /><strong>ร้านในกลุ่ม</strong></span><em>{memberCount} ร้าน</em></div>
              {memberCount === 0 ? <div className="hub-empty">ยังไม่มีร้านในกลุ่ม</div> : (
                <div className="hub-member-list">
                  {data.members.map((member) => (
                    <article className="hub-member" key={member.id}>
                      <div className="hub-member-main">
                        <strong>{[member.first_name, member.last_name].filter(Boolean).join(" ") || member.phone}</strong>
                        <small>{member.phone} · KYC {member.kyc_status === "approved" ? "ผ่าน" : member.kyc_status}{member.business_description ? ` · ${member.business_description}` : ""}</small>
                      </div>
                      <div className="hub-member-limit">
                        <input value={memberLimitDrafts[member.id] ?? ""} onChange={(event) => setMemberLimitDrafts((current) => ({ ...current, [member.id]: event.target.value.replace(/[^0-9.]/g, "") }))} inputMode="decimal" />
                        <span>บาท/วัน</span>
                      </div>
                      <div className="hub-member-actions">
                        <button className="hub-outline" onClick={() => saveMemberLimit(member)} disabled={saving}><Save />บันทึก</button>
                        <button className="hub-danger" onClick={() => removeMerchant(member)} disabled={saving}><Trash2 />ออกจากกลุ่ม</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {tab === "history" && data && (
          <section className="hub-panel">
            <div className="hub-section-head"><span><Users /><strong>Audit Log</strong></span><em>{sortedAudit.length} รายการล่าสุด</em></div>
            {sortedAudit.length === 0 ? <div className="hub-empty">ยังไม่มีประวัติ</div> : (
              <div className="hub-audit">
                {sortedAudit.map((row, index) => (
                  <article key={row.created_at + row.action + index}>
                    <b>{actionLabel(row.action)}</b>
                    <span>{row.phone || "ทั้งกลุ่ม"} · โดย {row.actor}</span>
                    <time>{dt.format(new Date(row.created_at.replace(" ", "T") + "Z"))}</time>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {(tab === "settings" || tab === "api") && <section className="hub-panel hub-placeholder">เมนูนี้คงไว้ตามโครงสร้าง Hub เดิม และไม่กระทบการเพิ่มร้านเข้ากลุ่มรอบนี้</section>}
      </main>
    </div>
  );
}
