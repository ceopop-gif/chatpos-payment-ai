"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Phone,
  RotateCcw,
  Save,
  Search,
  ShieldOff,
  Users,
} from "lucide-react";
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
  group_member_id: string | null;
  current_group_id: string | null;
  current_group_name: string | null;
};

type HubGroup = {
  id: string;
  name: string;
  member_count: number;
};

type Draft = {
  phone: string;
  note: string;
  groupId: string;
};

const inputStyle = {
  minHeight: 44,
  border: "1px solid #dce3ec",
  borderRadius: 12,
  padding: "0 12px",
  background: "#fff",
  width: "100%",
} as const;

export default function BypassPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState<HubGroup[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [bypassResponse, groupsResponse] = await Promise.all([
        fetch("/api/bypass", { cache: "no-store" }),
        fetch("/api/chatposhub/groups", { cache: "no-store" }),
      ]);

      if (bypassResponse.status === 401 || groupsResponse.status === 401) {
        window.location.replace("/admin/login?returnTo=/bypass");
        return;
      }

      const bypassPayload = await bypassResponse.json() as { rows?: Row[]; error?: string };
      const groupsPayload = await groupsResponse.json() as { groups?: HubGroup[]; error?: string };

      if (!bypassResponse.ok) throw new Error(bypassPayload.error || "โหลดข้อมูล OTP ไม่สำเร็จ");
      if (!groupsResponse.ok) throw new Error(groupsPayload.error || "โหลดกลุ่ม ChatPOS Hub ไม่สำเร็จ");

      const nextRows = bypassPayload.rows ?? [];
      setRows(nextRows);
      setGroups(groupsPayload.groups ?? []);
      setDrafts(Object.fromEntries(nextRows.map((row) => [
        row.phone,
        {
          phone: row.phone,
          note: row.note || "",
          groupId: row.current_group_id || "",
        },
      ])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.phone,
        row.first_name,
        row.last_name,
        row.business_description,
        row.current_group_name,
        row.note,
      ].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [rows, searchTerm]);

  const summary = useMemo(() => ({
    total: rows.length,
    grouped: rows.filter((row) => row.current_group_id).length,
    ungrouped: rows.filter((row) => !row.current_group_id).length,
  }), [rows]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setWorkingKey("add");
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
      setSuccess(`ยกเลิก OTP สำหรับ ${phone} แล้ว`);
      setPhone("");
      setNote("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ยกเลิก OTP ไม่สำเร็จ");
    } finally {
      setWorkingKey("");
    }
  };

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { phone: key, note: "", groupId: "" }), ...patch },
    }));
  };

  const saveRow = async (row: Row) => {
    const draft = drafts[row.phone] ?? { phone: row.phone, note: row.note || "", groupId: row.current_group_id || "" };
    setWorkingKey(row.phone);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/bypass", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          oldPhone: row.phone,
          phone: draft.phone,
          note: draft.note,
          groupId: draft.groupId || null,
        }),
      });
      const payload = await response.json() as { error?: string; phone?: string; group?: { name: string } | null };
      if (!response.ok) throw new Error(payload.error || "บันทึกข้อมูลไม่สำเร็จ");
      setSuccess(`บันทึก ${payload.phone || draft.phone} แล้ว${payload.group?.name ? ` · Team: ${payload.group.name}` : ""}`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setWorkingKey("");
    }
  };

  const restoreOtp = async (row: Row) => {
    if (!window.confirm(`เปิด OTP กลับให้เบอร์ ${row.phone} หรือไม่?`)) return;
    setWorkingKey(row.phone);
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
      setWorkingKey("");
    }
  };

  return (
    <div className="hub-shell">
      <header className="hub-topbar">
        <div className="hub-brand"><b>Chat<span>POS</span></b><i /><strong>OTP & Team</strong></div>
        <a href="/chatposhub" className="hub-top-link"><Users />จัดการกลุ่ม</a>
      </header>

      <main className="hub-group-main">
        <a href="/admin" className="hub-back"><ArrowLeft />กลับ Admin ใหญ่</a>

        <section className="hub-title">
          <div><ShieldOff /></div>
          <span>
            <small>OTP BYPASS & CHATPOS HUB</small>
            <h1>จัดการเบอร์ไม่ใช้ OTP และเลือก Team</h1>
            <p>แก้ไขเบอร์ได้ เลือกกลุ่มจาก /chatposhub ได้ทันที และเห็นสถานะว่าแต่ละเบอร์อยู่ Team ไหน</p>
          </span>
        </section>

        {error && <div className="hub-error">{error}</div>}
        {success && <div className="hub-success">{success}</div>}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 16 }}>
          <div className="hub-panel" style={{ margin: 0 }}><small>เบอร์ไม่ใช้ OTP</small><strong style={{ display: "block", fontSize: 28, marginTop: 4 }}>{summary.total}</strong></div>
          <div className="hub-panel" style={{ margin: 0 }}><small>เข้า Team แล้ว</small><strong style={{ display: "block", fontSize: 28, marginTop: 4 }}>{summary.grouped}</strong></div>
          <div className="hub-panel" style={{ margin: 0 }}><small>ยังไม่เลือก Team</small><strong style={{ display: "block", fontSize: 28, marginTop: 4 }}>{summary.ungrouped}</strong></div>
        </section>

        <section className="hub-panel">
          <div className="hub-card-heading">
            <CheckCircle2 />
            <span><strong>เพิ่มเบอร์ไม่ใช้ OTP</strong><small>เบอร์ต้องมีอยู่ในฐานข้อมูลร้านค้า ChatPOS</small></span>
          </div>
          <form onSubmit={add} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) minmax(220px,2fr) auto", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#5f6d80" }}>เบอร์มือถือ</span>
              <input style={inputStyle} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="08XXXXXXXX" />
            </label>
            <label style={{ display: "grid", gap: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#5f6d80" }}>หมายเหตุ</span>
              <input style={inputStyle} value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น อนุมัติสำหรับ Hub / ทีมขาย..." />
            </label>
            <button className="hub-primary" disabled={workingKey === "add"} style={{ minHeight: 44 }}>
              <CheckCircle2 />{workingKey === "add" ? "กำลังบันทึก..." : "เพิ่มเบอร์"}
            </button>
          </form>
        </section>

        <section className="hub-panel">
          <div className="hub-section-head">
            <span><Phone /><strong>จัดการเบอร์ทั้งหมด</strong></span>
            <em>{filteredRows.length} / {rows.length} เบอร์</em>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, border: "1px solid #dce3ec", borderRadius: 12, padding: "0 12px", background: "#fff" }}>
            <Search size={18} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ค้นหาเบอร์ ชื่อร้าน ชื่อคน หรือชื่อ Team"
              style={{ border: 0, outline: "none", minHeight: 46, width: "100%", background: "transparent" }}
            />
          </label>

          {loading ? (
            <div className="hub-empty">กำลังโหลด...</div>
          ) : filteredRows.length === 0 ? (
            <div className="hub-empty">ไม่พบรายการ</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {filteredRows.map((row) => {
                const draft = drafts[row.phone] ?? { phone: row.phone, note: row.note || "", groupId: row.current_group_id || "" };
                const approved = row.kyc_status === "approved" && row.account_status === "approved";
                return (
                  <article key={row.phone} className="hub-panel" style={{ margin: 0, border: "1px solid #e5eaf0", boxShadow: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: 17 }}>{[row.first_name, row.last_name].filter(Boolean).join(" ") || row.phone}</strong>
                        <div style={{ marginTop: 5, color: "#687387", fontSize: 13 }}>{row.business_description || "ไม่ระบุประเภทธุรกิจ"}</div>
                      </div>
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ padding: "5px 9px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: approved ? "#e8f7ef" : "#fff4df", color: approved ? "#16794b" : "#9a6500" }}>
                          KYC {approved ? "พร้อม" : "ยังไม่พร้อม"}
                        </span>
                        <span style={{ padding: "5px 9px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: row.current_group_id ? "#eaf1ff" : "#f2f4f7", color: row.current_group_id ? "#2457a7" : "#677386" }}>
                          {row.current_group_name ? `Team: ${row.current_group_name}` : "ยังไม่เข้า Team"}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "minmax(170px,1fr) minmax(180px,1.1fr) minmax(220px,1.5fr)", gap: 10 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: "#5f6d80" }}><Edit3 size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />แก้ไขเบอร์</span>
                        <input
                          style={inputStyle}
                          value={draft.phone}
                          onChange={(event) => updateDraft(row.phone, { phone: event.target.value.replace(/\D/g, "").slice(0, 10) })}
                          inputMode="numeric"
                        />
                      </label>

                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: "#5f6d80" }}>เลือก Team จาก /chatposhub</span>
                        <select
                          style={inputStyle}
                          value={draft.groupId}
                          onChange={(event) => updateDraft(row.phone, { groupId: event.target.value })}
                        >
                          <option value="">ยังไม่เข้ากลุ่ม</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>{group.name} ({Number(group.member_count || 0)} ร้าน)</option>
                          ))}
                        </select>
                      </label>

                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: "#5f6d80" }}>หมายเหตุ</span>
                        <input
                          style={inputStyle}
                          value={draft.note}
                          onChange={(event) => updateDraft(row.phone, { note: event.target.value })}
                          placeholder="หมายเหตุของ Admin"
                        />
                      </label>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button className="hub-outline" onClick={() => restoreOtp(row)} disabled={workingKey === row.phone}>
                        <RotateCcw />เปิด OTP กลับ
                      </button>
                      <button className="hub-primary" onClick={() => saveRow(row)} disabled={workingKey === row.phone}>
                        <Save />{workingKey === row.phone ? "กำลังบันทึก..." : "บันทึกเบอร์และ Team"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
