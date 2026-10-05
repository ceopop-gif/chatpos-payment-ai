"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UnlockKeyhole,
  XCircle,
} from "lucide-react";

type Merchant = {
  id: string;
  applicationNumber: string;
  phone: string;
  name: string;
  address: string;
  businessDescription: string;
  kycStatus: string;
  accountStatus: string;
  approvedAt: string | null;
  editAllowed: boolean;
  allowedBy: string | null;
  allowedAt: string | null;
  revokedAt: string | null;
  consumedAt: string | null;
  permissionNote: string;
};

type ResponsePayload = {
  merchants: Merchant[];
  summary: { totalMerchants: number; allowedMerchants: number };
  search: string;
  error?: string;
};

const dateTime = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

function kycLabel(status: string) {
  if (status === "approved") return "ผ่าน KYC";
  if (status === "rejected") return "ไม่ผ่าน KYC";
  if (status === "suspended") return "ระงับ";
  return "รอตรวจ KYC";
}

function accountLabel(status: string) {
  if (status === "approved") return "ร้านใช้งานอยู่";
  if (status === "suspended") return "ระงับการใช้งาน";
  if (status === "rejected") return "ไม่อนุมัติ";
  return "กำลังดำเนินการ";
}

export default function KycEditAdminPage() {
  const [rows, setRows] = useState<Merchant[]>([]);
  const [summary, setSummary] = useState({ totalMerchants: 0, allowedMerchants: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [notice, setNotice] = useState("");
  const [noteByMerchant, setNoteByMerchant] = useState<Record<string, string>>({});

  const load = useCallback(async (silent = false, query = search) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await fetch(
        "/api/admin/kyc-edit?q=" + encodeURIComponent(query.trim()),
        { cache: "no-store" },
      );
      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }
      const payload = (await response.json()) as ResponsePayload;
      if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลไม่สำเร็จ");
      setRows(payload.merchants ?? []);
      setSummary(payload.summary ?? { totalMerchants: 0, allowedMerchants: 0 });
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => {
    void load(false, "");
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(true, search);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, load]);

  const visibleAllowed = useMemo(
    () => rows.filter((merchant) => merchant.editAllowed).length,
    [rows],
  );

  const updatePermission = async (merchant: Merchant, action: "allow" | "revoke") => {
    const confirmation = action === "allow"
      ? `อนุญาตให้ ${merchant.name} แก้ไขและส่ง KYC ใหม่ใช่หรือไม่?`
      : `ยกเลิกสิทธิ์แก้ไข KYC ของ ${merchant.name} ใช่หรือไม่?`;
    if (!window.confirm(confirmation)) return;

    setWorkingId(merchant.id);
    setNotice("");
    try {
      const response = await fetch("/api/admin/kyc-edit", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          action,
          note: noteByMerchant[merchant.id] ?? "",
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "อัปเดตสิทธิ์ไม่สำเร็จ");
      setNotice(
        action === "allow"
          ? `อนุญาตให้ ${merchant.name} แก้ไขและส่ง KYC ใหม่แล้ว`
          : `ยกเลิกสิทธิ์แก้ไข KYC ของ ${merchant.name} แล้ว`,
      );
      await load(true, search);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "อัปเดตสิทธิ์ไม่สำเร็จ");
    } finally {
      setWorkingId("");
    }
  };

  return (
    <div className="kyc-edit-admin-shell">
      <header className="kyc-edit-admin-topbar">
        <button type="button" onClick={() => window.location.assign("/admin")} aria-label="กลับหลังบ้าน">
          <ArrowLeft />
        </button>
        <div>
          <small>CHATPOS BACKOFFICE</small>
          <h1>แก้ไข KYC</h1>
          <p>ค้นหาร้าน แล้วอนุญาตเป็นรายร้านให้แก้ไขหรือส่ง KYC ใหม่</p>
        </div>
        <button
          type="button"
          className={refreshing ? "refreshing" : ""}
          onClick={() => void load(true, search)}
          aria-label="รีเฟรช"
        >
          <RefreshCw />
        </button>
      </header>

      <main className="kyc-edit-admin-main">
        {notice && (
          <div className="kyc-edit-notice">
            <CheckCircle2 />
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")}><XCircle /></button>
          </div>
        )}

        <section className="kyc-edit-admin-hero">
          <div>
            <span><ShieldCheck /></span>
            <div>
              <small>ควบคุมสิทธิ์แบบรายร้าน</small>
              <h2>ร้านจะแก้ไข KYC ไม่ได้ จนกว่าหลังบ้านอนุญาต</h2>
              <p>การอนุญาตนี้แยกจากระบบรับเงินและถอนเงิน จึงไม่เปลี่ยนยอดหรือสถานะธุรกรรมของร้าน</p>
            </div>
          </div>
          <div className="kyc-edit-kpis">
            <article>
              <Store />
              <span><small>ร้านทั้งหมด</small><strong>{summary.totalMerchants}</strong></span>
            </article>
            <article className="allowed">
              <UnlockKeyhole />
              <span><small>กำลังอนุญาตแก้ไข</small><strong>{summary.allowedMerchants}</strong></span>
            </article>
            <article>
              <Search />
              <span><small>ผลที่แสดง</small><strong>{rows.length}</strong></span>
            </article>
          </div>
        </section>

        <section className="kyc-edit-search-panel">
          <label>
            <Search />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อร้าน เบอร์มือถือ หรือเลขใบสมัคร..."
              autoComplete="off"
            />
          </label>
          <span>{search ? `พบ ${rows.length} ร้าน` : `แสดงล่าสุดสูงสุด 300 ร้าน`}</span>
        </section>

        {loading ? (
          <section className="kyc-edit-loading">
            <RefreshCw />
            <strong>กำลังโหลดร้านค้า...</strong>
          </section>
        ) : (
          <section className="kyc-edit-list">
            {rows.map((merchant) => (
              <article key={merchant.id} className={merchant.editAllowed ? "edit-open" : ""}>
                <header>
                  <span className="store-icon"><Store /></span>
                  <div>
                    <small>{merchant.applicationNumber}</small>
                    <h3>{merchant.name || "ไม่ระบุชื่อร้าน"}</h3>
                    <p>{merchant.phone}</p>
                  </div>
                  <div className="status-stack">
                    <b className={merchant.kycStatus}>{kycLabel(merchant.kycStatus)}</b>
                    <em>{accountLabel(merchant.accountStatus)}</em>
                  </div>
                </header>

                <div className="kyc-edit-merchant-summary">
                  <span><small>ข้อมูลร้าน</small><strong>{merchant.businessDescription || "ยังไม่มีรายละเอียด"}</strong></span>
                  <span><small>ที่อยู่</small><strong>{merchant.address || "ยังไม่มีที่อยู่"}</strong></span>
                  <span>
                    <small>สิทธิ์แก้ไข KYC</small>
                    <strong className={merchant.editAllowed ? "permission-open" : "permission-closed"}>
                      {merchant.editAllowed ? <><UnlockKeyhole /> อนุญาตแล้ว</> : <><LockKeyhole /> ยังไม่อนุญาต</>}
                    </strong>
                  </span>
                </div>

                {merchant.editAllowed && (
                  <div className="kyc-edit-active-permission">
                    <BadgeCheck />
                    <div>
                      <strong>ร้านนี้สามารถแก้ไขและส่ง KYC ใหม่ได้</strong>
                      <small>
                        {merchant.allowedAt
                          ? `อนุญาตเมื่อ ${dateTime.format(new Date(merchant.allowedAt))}`
                          : "เปิดสิทธิ์แล้ว"}
                        {merchant.allowedBy ? ` · โดย ${merchant.allowedBy}` : ""}
                      </small>
                    </div>
                  </div>
                )}

                <label className="kyc-edit-note">
                  <span>หมายเหตุสำหรับการอนุญาต</span>
                  <input
                    value={noteByMerchant[merchant.id] ?? merchant.permissionNote ?? ""}
                    onChange={(event) => setNoteByMerchant((current) => ({
                      ...current,
                      [merchant.id]: event.target.value,
                    }))}
                    placeholder="เช่น ขอเปลี่ยนรูปหน้าร้าน / แก้พิกัด / อัปเดตข้อมูลเจ้าของร้าน"
                    maxLength={1000}
                  />
                </label>

                <footer>
                  {merchant.editAllowed ? (
                    <button
                      type="button"
                      className="revoke"
                      disabled={workingId === merchant.id}
                      onClick={() => void updatePermission(merchant, "revoke")}
                    >
                      <LockKeyhole />
                      {workingId === merchant.id ? "กำลังบันทึก..." : "ยกเลิกสิทธิ์แก้ไข"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="allow"
                      disabled={workingId === merchant.id}
                      onClick={() => void updatePermission(merchant, "allow")}
                    >
                      <UnlockKeyhole />
                      {workingId === merchant.id ? "กำลังบันทึก..." : "อนุญาตแก้ไข / ส่ง KYC ใหม่"}
                    </button>
                  )}
                </footer>
              </article>
            ))}

            {!rows.length && (
              <div className="kyc-edit-empty">
                <ClipboardCheck />
                <strong>ไม่พบร้านค้า</strong>
                <small>ลองค้นหาด้วยชื่อ เบอร์มือถือ หรือเลขใบสมัครอีกครั้ง</small>
              </div>
            )}
          </section>
        )}

        <footer className="kyc-edit-safe-note">
          <ShieldCheck />
          <span>
            <strong>หน้านี้แก้เฉพาะสิทธิ์ KYC</strong>
            <small>ไม่แก้ payment, payout, balance, transaction หรือ settlement ของร้าน</small>
          </span>
          <b>{visibleAllowed} ร้านในผลค้นหากำลังเปิดสิทธิ์</b>
        </footer>
      </main>
    </div>
  );
}
