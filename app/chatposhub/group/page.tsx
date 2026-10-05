"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Save,
  Search,
  Store,
  Trash2,
  Users,
  X,
} from "lucide-react";
import "../hub.css";

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

type GroupPayload = {
  group: {
    id: string;
    name: string;
    status: string;
    default_daily_limit_cents: number;
    created_at: string;
  };
  members: HubMember[];
  audit: AuditRow[];
};

type SearchRow = {
  id: string;
  phone: string;
  name: string;
  businessDescription: string;
  kycStatus: string;
  accountStatus: string;
  otpBypass: boolean;
  eligible: boolean;
  reason: string;
  currentGroup: { id: string; name: string } | null;
};

type SearchPayload = {
  query: string;
  results: SearchRow[];
  summary: { total: number; eligible: number; blocked: number };
};

const dt = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

function actionLabel(action: string) {
  return action === "member.added"
    ? "เพิ่มร้านเข้ากลุ่ม"
    : action === "member.removed"
      ? "นำร้านออกจากกลุ่ม"
      : action === "member.limit_changed"
        ? "แก้วงเงินร้าน"
        : action === "group.limit_changed"
          ? "แก้วงเงินทั้งกลุ่ม"
          : action === "group.created"
            ? "สร้างกลุ่ม"
            : action;
}

export default function ChatPosHubGroupPage() {
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState<GroupPayload | null>(null);
  const [tab, setTab] = useState<"merchants" | "settings" | "api" | "history">("merchants");
  const [limit, setLimit] = useState("50000");
  const [memberLimitDrafts, setMemberLimitDrafts] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);
  const [searchSummary, setSearchSummary] = useState<SearchPayload["summary"]>({ total: 0, eligible: 0, blocked: 0 });
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [choiceNotice, setChoiceNotice] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const requireAdmin = (response: Response) => {
    if (response.status !== 401) return false;
    window.location.replace(
      "/admin/login?returnTo=" + encodeURIComponent(window.location.pathname + window.location.search),
    );
    return true;
  };

  const load = async (id: string) => {
    setError("");
    const response = await fetch(
      `/api/chatposhub/group?groupId=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (requireAdmin(response)) return;
    const payload = (await response.json()) as GroupPayload & { error?: string };
    if (!response.ok) throw new Error(payload.error || "โหลดกลุ่มไม่สำเร็จ");
    setData(payload);
    setLimit(String((payload.group.default_daily_limit_cents || 0) / 100));
    setMemberLimitDrafts(
      Object.fromEntries(
        payload.members.map((member) => [member.id, String(member.daily_limit_cents / 100)]),
      ),
    );
  };

  const searchShops = async (id: string, query: string) => {
    setSearching(true);
    setError("");
    try {
      const params = new URLSearchParams({ groupId: id, q: query.trim() });
      const response = await fetch(`/api/chatposhub/search?${params.toString()}`, {
        cache: "no-store",
      });
      if (requireAdmin(response)) return;
      const payload = (await response.json()) as SearchPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "ค้นหาร้านไม่สำเร็จ");
      setSearchRows(payload.results ?? []);
      setSearchSummary(payload.summary ?? { total: 0, eligible: 0, blocked: 0 });
      setSelectedPhones((current) =>
        current.filter((phone) => (payload.results ?? []).some((row) => row.phone === phone && row.eligible)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ค้นหาร้านไม่สำเร็จ");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("groupId") ?? "";
    setGroupId(id);
    if (!id) {
      setError("ไม่พบรหัสกลุ่ม");
      return;
    }
    void Promise.all([load(id), searchShops(id, "")]).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ"),
    );
  }, []);

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!groupId) return;
    await searchShops(groupId, searchTerm);
  };

  const choosePhone = (row: SearchRow) => {
    if (saving) return;

    if (row.currentGroup) {
      setSelectedPhones((current) => current.filter((phone) => phone !== row.phone));
      setChoiceNotice((current) => ({
        ...current,
        [row.phone]: `เบอร์ ${row.phone} อยู่ในกลุ่ม "${row.currentGroup?.name}" แล้ว`,
      }));
      return;
    }

    if (!row.eligible) {
      setSelectedPhones((current) => current.filter((phone) => phone !== row.phone));
      setChoiceNotice((current) => ({ ...current, [row.phone]: row.reason }));
      return;
    }

    setChoiceNotice((current) => {
      const next = { ...current };
      delete next[row.phone];
      return next;
    });
    setSelectedPhones((current) =>
      current.includes(row.phone)
        ? current.filter((phone) => phone !== row.phone)
        : [...current, row.phone],
    );
  };

  const toggleAllEligible = () => {
    const eligiblePhones = searchRows.filter((row) => row.eligible).map((row) => row.phone);
    const allSelected = eligiblePhones.length > 0 && eligiblePhones.every((phone) => selectedPhones.includes(phone));
    setSelectedPhones((current) => {
      if (allSelected) return current.filter((phone) => !eligiblePhones.includes(phone));
      return Array.from(new Set([...current, ...eligiblePhones]));
    });
  };

  const saveSelected = async () => {
    if (!selectedPhones.length || !groupId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/chatposhub/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "add_members",
          groupId,
          phones: selectedPhones,
        }),
      });
      const payload = (await response.json()) as { error?: string; count?: number };
      if (!response.ok) throw new Error(payload.error || "บันทึกร้านเข้ากลุ่มไม่สำเร็จ");
      setSuccess(`บันทึกเข้ากลุ่มสำเร็จ ${payload.count ?? selectedPhones.length} ร้าน`);
      setSelectedPhones([]);
      await Promise.all([load(groupId), searchShops(groupId, searchTerm)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกร้านเข้ากลุ่มไม่สำเร็จ");
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
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "นำร้านออกไม่สำเร็จ");
      setSuccess("นำร้านออกจากกลุ่มแล้ว");
      await Promise.all([load(groupId), searchShops(groupId, searchTerm)]);
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
        body: JSON.stringify({
          action: "set_group_limit",
          groupId,
          dailyLimit: Number(limit),
        }),
      });
      const payload = (await response.json()) as { error?: string };
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
      const payload = (await response.json()) as { error?: string };
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
  const allEligibleSelected =
    searchSummary.eligible > 0 &&
    searchRows.filter((row) => row.eligible).every((row) => selectedPhones.includes(row.phone));

  return (
    <div className="hub-shell">
      <header className="hub-topbar">
        <div className="hub-brand">
          <b>Chat<span>POS</span></b><i /><strong>Hub</strong>
        </div>
        <a href="/chatposhub" className="hub-top-link"><Users />จัดการกลุ่ม</a>
      </header>

      <main className="hub-group-main">
        <a href="/chatposhub" className="hub-back"><ArrowLeft />กลับหน้ารวมกลุ่ม</a>

        <section className="hub-title">
          <div><Store /></div>
          <span>
            <small>CHATPOS HUB GROUP</small>
            <h1>{data?.group.name ?? "กำลังโหลดกลุ่ม..."}</h1>
            <p>{memberCount.toLocaleString("th-TH")} ร้านในกลุ่ม</p>
          </span>
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
            <section className="hub-panel hub-add-store-panel">
              <div className="hub-card-heading">
                <Search />
                <span>
                  <strong>เลือกเบอร์ร้านที่ไม่ต้องใช้ OTP</strong>
                  <small>แสดงทุกเบอร์ที่ยกเลิก OTP แล้ว เลือกเบอร์ที่ต้องการเข้ากลุ่มได้ทันที</small>
                </span>
              </div>

              <form className="hub-store-search" onSubmit={submitSearch}>
                <label>
                  <span>ค้นหาเบอร์มือถือหรือชื่อร้าน</span>
                  <div>
                    <Search />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="เช่น 0812345678 หรือชื่อร้าน"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        className="hub-search-clear"
                        onClick={() => {
                          setSearchTerm("");
                          void searchShops(groupId, "");
                        }}
                        aria-label="ล้างการค้นหา"
                      >
                        <X />
                      </button>
                    )}
                  </div>
                </label>
                <button className="hub-primary" disabled={searching}>
                  <Search />{searching ? "กำลังค้นหา..." : "ค้นหา"}
                </button>
                <button
                  type="button"
                  className="hub-outline"
                  disabled={searching}
                  onClick={() => void searchShops(groupId, searchTerm)}
                >
                  <RefreshCw />รีเฟรช
                </button>
              </form>

              <div className="hub-search-summary">
                <span><b>{searchSummary.total}</b> เบอร์ไม่ใช้ OTP</span>
                <span className="ready"><b>{searchSummary.eligible}</b> เบอร์พร้อมเข้ากลุ่ม</span>
                <span className="blocked"><b>{searchSummary.blocked}</b> เบอร์มีเงื่อนไข</span>
              </div>

              {searchRows.length > 0 && (
                <div className="hub-select-tools">
                  <button type="button" className="hub-outline" onClick={toggleAllEligible}>
                    {allEligibleSelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมดที่เพิ่มได้"}
                  </button>
                  <span>เลือกแล้ว <strong>{selectedPhones.length}</strong> ร้าน</span>
                </div>
              )}

              {searchRows.length === 0 ? (
                <div className="hub-empty hub-store-empty">
                  <Search />
                  <strong>{searching ? "กำลังค้นหา..." : "ไม่พบเบอร์ที่ยกเลิก OTP"}</strong>
                  <small>หน้านี้แสดงเฉพาะเบอร์ที่ระบบกำหนดว่าไม่ต้องใช้ OTP</small>
                </div>
              ) : (
                <div className="hub-search-results">
                  {searchRows.map((row) => {
                    const selected = selectedPhones.includes(row.phone);
                    return (
                      <article
                        key={row.id}
                        className={`${row.eligible ? "eligible" : "blocked"} ${selected ? "selected" : ""}`}
                      >
                        <button
                          type="button"
                          className="hub-select-box"
                          disabled={saving}
                          onClick={() => choosePhone(row)}
                          aria-label={selected ? "ยกเลิกการเลือก" : "เลือกร้าน"}
                        >
                          <span>{selected ? "✓" : ""}</span>
                        </button>

                        <div className="hub-search-shop">
                          <strong>{row.phone}</strong>
                          <b>{row.name}</b>
                          <small>{row.businessDescription || "ไม่มีรายละเอียดร้าน"}</small>
                        </div>

                        <div className="hub-search-status">
                          <span className={row.kycStatus === "approved" && row.accountStatus === "approved" ? "ok" : "bad"}>
                            KYC {row.kycStatus === "approved" && row.accountStatus === "approved" ? "ผ่าน" : "ยังไม่ผ่าน"}
                          </span>
                          <span className="ok">
                            OTP ไม่ต้องใช้
                          </span>
                        </div>

                        <div className="hub-search-group">
                          <small>สถานะกลุ่ม</small>
                          <strong>{row.currentGroup?.name ?? "ยังไม่อยู่ในกลุ่ม"}</strong>
                          <em className={row.eligible ? "ok" : "bad"}>{row.reason}</em>
                          {choiceNotice[row.phone] && <p className="hub-row-choice-notice">{choiceNotice[row.phone]}</p>}
                        </div>

                        <button
                          type="button"
                          className={row.currentGroup ? "hub-grouped-button" : row.eligible ? (selected ? "hub-selected-button" : "hub-choose-button") : "hub-disabled-button"}
                          disabled={saving}
                          onClick={() => choosePhone(row)}
                        >
                          {row.currentGroup ? "ตรวจสอบกลุ่ม" : row.eligible ? (selected ? "เลือกแล้ว" : "เลือกเข้ากลุ่ม") : "ตรวจสอบ"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className={`hub-save-selection ${selectedPhones.length ? "active" : ""}`}>
                <div>
                  <small>ร้านที่เลือก</small>
                  <strong>{selectedPhones.length.toLocaleString("th-TH")} ร้าน</strong>
                  <span>{selectedPhones.length ? selectedPhones.join(", ") : "เลือกเบอร์ที่ยังไม่อยู่ในกลุ่มจากรายการด้านบน"}</span>
                </div>
                <button
                  type="button"
                  className="hub-primary"
                  disabled={!selectedPhones.length || saving}
                  onClick={saveSelected}
                >
                  <Save />{saving ? "กำลังบันทึก..." : "บันทึกเข้ากลุ่ม"}
                </button>
              </div>
            </section>

            <section className="hub-panel">
              <div className="hub-card-heading">
                <Save />
                <span>
                  <strong>กำหนดวงเงินร้านเท่ากัน (บาท / วัน)</strong>
                  <small>บันทึกครั้งเดียวจะใช้กับร้านที่อยู่ในกลุ่มนี้ทั้งหมด</small>
                </span>
              </div>
              <div className="hub-limit-row">
                <label>
                  <span>วงเงินต่อร้าน</span>
                  <input
                    value={limit}
                    onChange={(event) => setLimit(event.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                  />
                </label>
                <button className="hub-primary" onClick={saveGroupLimit} disabled={saving}>
                  <Save />บันทึกทุกร้าน
                </button>
              </div>
            </section>

            <section className="hub-panel">
              <div className="hub-section-head">
                <span><Store /><strong>ร้านในกลุ่ม</strong></span>
                <em>{memberCount} ร้าน</em>
              </div>

              {memberCount === 0 ? (
                <div className="hub-empty">ยังไม่มีร้านในกลุ่ม — ใช้ช่อง “เพิ่มเบอร์ร้านเข้ากลุ่ม” ด้านบน</div>
              ) : (
                <div className="hub-member-list">
                  {data.members.map((member) => (
                    <article className="hub-member" key={member.id}>
                      <div className="hub-member-main">
                        <strong>{[member.first_name, member.last_name].filter(Boolean).join(" ") || member.phone}</strong>
                        <small>
                          {member.phone} · KYC {member.kyc_status === "approved" ? "ผ่าน" : member.kyc_status}
                          {member.business_description ? ` · ${member.business_description}` : ""}
                        </small>
                      </div>
                      <div className="hub-member-limit">
                        <input
                          value={memberLimitDrafts[member.id] ?? ""}
                          onChange={(event) =>
                            setMemberLimitDrafts((current) => ({
                              ...current,
                              [member.id]: event.target.value.replace(/[^0-9.]/g, ""),
                            }))
                          }
                          inputMode="decimal"
                        />
                        <span>บาท/วัน</span>
                      </div>
                      <div className="hub-member-actions">
                        <button className="hub-outline" onClick={() => saveMemberLimit(member)} disabled={saving}>
                          <Save />บันทึก
                        </button>
                        <button className="hub-danger" onClick={() => removeMerchant(member)} disabled={saving}>
                          <Trash2 />ออกจากกลุ่ม
                        </button>
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
            <div className="hub-section-head">
              <span><Users /><strong>Audit Log</strong></span>
              <em>{sortedAudit.length} รายการล่าสุด</em>
            </div>
            {sortedAudit.length === 0 ? (
              <div className="hub-empty">ยังไม่มีประวัติ</div>
            ) : (
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

        {(tab === "settings" || tab === "api") && (
          <section className="hub-panel hub-placeholder">
            เมนูนี้คงไว้ตามโครงสร้าง Hub เดิม
          </section>
        )}
      </main>
    </div>
  );
}
