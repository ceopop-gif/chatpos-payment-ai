import { getD1 } from "../db";

export type HubMerchantLookup = {
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

export function normalizeThaiPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length === 11) return "0" + digits.slice(2);
  return digits.slice(0, 10);
}

export async function ensureChatPosHubSchema() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS otp_bypass_phones (
      phone TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      note TEXT NOT NULL DEFAULT '',
      cancelled_by TEXT,
      cancelled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS chatposhub_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      default_daily_limit_cents INTEGER NOT NULL DEFAULT 5000000,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS chatposhub_group_members (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      daily_limit_cents INTEGER NOT NULL DEFAULT 5000000,
      status TEXT NOT NULL DEFAULT 'active',
      added_by TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      removed_by TEXT,
      removed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS chatposhub_group_member_active_phone_unique ON chatposhub_group_members(phone) WHERE status = 'active'"),
    db.prepare("CREATE INDEX IF NOT EXISTS chatposhub_group_member_group_status_idx ON chatposhub_group_members(group_id, status, added_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS chatposhub_group_member_merchant_idx ON chatposhub_group_members(merchant_id, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS chatposhub_audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT,
      merchant_id TEXT,
      phone TEXT,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS chatposhub_audit_group_created_idx ON chatposhub_audit_logs(group_id, created_at)"),
  ]);
}

async function hasOtpBypass(phone: string) {
  const db = getD1();
  const own = await db.prepare("SELECT phone FROM otp_bypass_phones WHERE phone = ? AND status = 'active' LIMIT 1").bind(phone).first();
  if (own) return true;

  const legacyChecks = [
    "SELECT phone FROM otp_bypass WHERE phone = ? AND status = 'active' LIMIT 1",
    "SELECT phone FROM bypass_phones WHERE phone = ? AND status = 'active' LIMIT 1",
    "SELECT phone FROM merchant_otp_bypass WHERE phone = ? AND status = 'active' LIMIT 1",
    "SELECT phone FROM otp_exemptions WHERE phone = ? AND status = 'active' LIMIT 1",
  ];
  for (const sql of legacyChecks) {
    try {
      const row = await db.prepare(sql).bind(phone).first();
      if (row) return true;
    } catch {
      // Compatibility check for older production schemas.
    }
  }
  return false;
}

export async function lookupHubMerchant(phoneInput: unknown, targetGroupId = ""): Promise<HubMerchantLookup> {
  await ensureChatPosHubSchema();
  const phone = normalizeThaiPhone(phoneInput);
  if (!/^0\d{9}$/.test(phone)) return { found: false, eligible: false, reason: "กรุณากรอกเบอร์มือถือ 10 หลัก" };

  const db = getD1();
  const merchant = await db.prepare(`
    SELECT id, phone, first_name, last_name, business_description, kyc_status, status
    FROM merchant_applications
    WHERE phone = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(phone).first();

  if (!merchant) return { found: false, eligible: false, reason: "ไม่พบเบอร์นี้ในฐานข้อมูลร้านค้า ChatPOS" };

  const merchantResult = {
    id: String(merchant.id),
    phone: String(merchant.phone),
    name: [merchant.first_name, merchant.last_name].filter(Boolean).join(" ").trim() || String(merchant.phone),
    businessDescription: String(merchant.business_description ?? ""),
    kycStatus: String(merchant.kyc_status ?? ""),
    accountStatus: String(merchant.status ?? ""),
  };

  if (merchantResult.kycStatus !== "approved" || merchantResult.accountStatus !== "approved") {
    return { found: true, eligible: false, reason: "ร้านนี้ยังไม่ผ่าน KYC หรือบัญชียังไม่พร้อมใช้งาน", merchant: merchantResult };
  }

  if (!(await hasOtpBypass(phone))) {
    return { found: true, eligible: false, reason: "เบอร์นี้ยังไม่ได้ยกเลิก OTP จึงยังเพิ่มเข้า Hub ไม่ได้", merchant: merchantResult };
  }

  const activeMember = await db.prepare(`
    SELECT m.group_id, g.name
    FROM chatposhub_group_members m
    JOIN chatposhub_groups g ON g.id = m.group_id
    WHERE m.phone = ? AND m.status = 'active' AND g.status = 'active'
    LIMIT 1
  `).bind(phone).first();

  if (activeMember && String(activeMember.group_id) !== targetGroupId) {
    return {
      found: true,
      eligible: false,
      reason: `เบอร์นี้อยู่ในกลุ่ม "${String(activeMember.name)}" แล้ว กรุณานำออกจากกลุ่มเดิมก่อน`,
      merchant: merchantResult,
      currentGroup: { id: String(activeMember.group_id), name: String(activeMember.name) },
    };
  }

  if (activeMember && String(activeMember.group_id) === targetGroupId) {
    return {
      found: true,
      eligible: false,
      reason: "เบอร์นี้อยู่ในกลุ่มนี้แล้ว",
      merchant: merchantResult,
      currentGroup: { id: String(activeMember.group_id), name: String(activeMember.name) },
    };
  }

  return { found: true, eligible: true, reason: "พร้อมเพิ่มเข้ากลุ่ม", merchant: merchantResult, currentGroup: null };
}
