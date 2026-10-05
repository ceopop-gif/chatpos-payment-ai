import { env } from "cloudflare:workers";
import { getD1 } from "../db";

const LOOKUP_TTL_MINUTES = 30;
const OTP_TTL_MINUTES = 10;
const MATCH_WINDOW_SECONDS = 180;
const FALLBACK_WINDOW_SECONDS = 900;
const MAX_SLIP_AGE_MS = 24 * 60 * 60 * 1000;

type AnyRow = Record<string, unknown>;

function envValue(name: string) {
  return String((env as unknown as Record<string, unknown>)[name] ?? "").trim();
}

export function normalizeThaiMobile(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length === 11) return "0" + digits.slice(2);
  return digits;
}

function toSmsMobile(value: string) {
  const local = normalizeThaiMobile(value);
  if (!/^0\d{9}$/.test(local)) throw new Error("หมายเลขโทรศัพท์ไม่ถูกต้อง");
  return "66" + local.slice(1);
}

function isoSql(date: Date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export async function ensureStopPaySchema() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS stoppay_lookups (
      token TEXT PRIMARY KEY NOT NULL,
      operation_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      paid_at TEXT NOT NULL,
      slip_reference TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS stoppay_lookups_expiry_idx ON stoppay_lookups(expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS stoppay_otp_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      lookup_token TEXT NOT NULL,
      phone TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      otp_id TEXT NOT NULL,
      reference_code TEXT,
      verified_at TEXT,
      expires_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS stoppay_otp_phone_created_idx ON stoppay_otp_sessions(phone, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS stoppay_identity_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      phone TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      otp_id TEXT NOT NULL,
      reference_code TEXT,
      verified_at TEXT,
      expires_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS stoppay_identity_phone_created_idx ON stoppay_identity_sessions(phone, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS stoppay_cases (
      id TEXT PRIMARY KEY NOT NULL,
      case_number TEXT NOT NULL UNIQUE,
      operation_id TEXT NOT NULL UNIQUE,
      gateway_reference TEXT,
      merchant_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      paid_at TEXT NOT NULL,
      slip_object_key TEXT,
      slip_reference TEXT,
      reporter_name TEXT NOT NULL,
      reporter_phone TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      reason_detail TEXT NOT NULL DEFAULT '',
      declaration_accepted INTEGER NOT NULL DEFAULT 0,
      otp_verified_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'merchant_action_required',
      merchant_contact_deadline TEXT NOT NULL,
      merchant_contacted_at TEXT,
      merchant_response_note TEXT NOT NULL DEFAULT '',
      hold_requested_at TEXT,
      refund_review_requested_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS stoppay_cases_merchant_status_idx ON stoppay_cases(merchant_id, status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS stoppay_cases_deadline_idx ON stoppay_cases(status, merchant_contact_deadline)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS stoppay_events (
      id TEXT PRIMARY KEY NOT NULL,
      case_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS stoppay_events_case_created_idx ON stoppay_events(case_id, created_at)"),
  ]);
  await db.prepare("DELETE FROM stoppay_lookups WHERE expires_at <= CURRENT_TIMESTAMP").run();
  await db.prepare("DELETE FROM stoppay_otp_sessions WHERE expires_at <= CURRENT_TIMESTAMP AND verified_at IS NULL").run();
  await db.prepare("DELETE FROM stoppay_identity_sessions WHERE expires_at <= CURRENT_TIMESTAMP AND verified_at IS NULL").run();
}

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (typeof part?.text === "string") return part.text;
    }
  }
  return "";
}

export async function extractSlipData(file: File) {
  const apiKey = envValue("OPENAI_API_KEY");
  if (!apiKey) return { needsManual: true as const, reason: "ยังไม่ได้ตั้งค่า AI สำหรับอ่านสลิป" };
  if (!file.type.startsWith("image/")) throw new Error("รองรับเฉพาะรูปภาพสลิป");
  if (file.size > 6 * 1024 * 1024) throw new Error("รูปสลิปต้องไม่เกิน 6 MB");

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  const dataUrl = `data:${file.type || "image/jpeg"};base64,${btoa(binary)}`;
  const model = envValue("STOPPAY_VISION_MODEL") || "gpt-4.1-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: "อ่านสลิปธนาคารไทยจากรูปนี้ คืนค่า JSON เท่านั้น: amount เป็นเลขจำนวนเงินบาท, paidAt เป็น ISO 8601 timezone +07:00 จากวันเวลาชำระบนสลิป, transactionReference เป็นเลขที่รายการ/เลขอ้างอิงที่เห็นบนสลิป, bankName เป็นชื่อธนาคารผู้โอน. ถ้าอ่านค่าใดไม่ได้ให้เป็น null. ปีไทยแบบ 69 หมายถึง พ.ศ. 2569 = ค.ศ. 2026.",
          },
          { type: "input_image", image_url: dataUrl },
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "thai_bank_slip",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              amount: { anyOf: [{ type: "number" }, { type: "null" }] },
              paidAt: { anyOf: [{ type: "string" }, { type: "null" }] },
              transactionReference: { anyOf: [{ type: "string" }, { type: "null" }] },
              bankName: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
            required: ["amount", "paidAt", "transactionReference", "bankName"],
          },
        },
      },
    }),
  });
  if (!response.ok) {
    return { needsManual: true as const, reason: "AI อ่านสลิปไม่สำเร็จ กรุณากรอกยอดและวันเวลาด้วยตนเอง" };
  }
  const payload = await response.json();
  const text = extractResponseText(payload);
  try {
    const parsed = JSON.parse(text) as { amount: number | null; paidAt: string | null; transactionReference: string | null; bankName: string | null };
    return { needsManual: false as const, ...parsed };
  } catch {
    return { needsManual: true as const, reason: "อ่านข้อมูลจากสลิปไม่ครบ กรุณากรอกยอดและวันเวลาด้วยตนเอง" };
  }
}

export async function findPaymentBySlip(input: { amount: number; paidAt: string; slipReference?: string | null }) {
  await ensureStopPaySchema();
  const amountCents = Math.round(Number(input.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("ยอดเงินไม่ถูกต้อง");

  const paidAt = new Date(input.paidAt);
  if (Number.isNaN(paidAt.getTime())) throw new Error("วันเวลาชำระไม่ถูกต้อง");
  const age = Date.now() - paidAt.getTime();
  if (age < -5 * 60 * 1000) throw new Error("วันเวลาบนสลิปอยู่ในอนาคต");
  if (age > MAX_SLIP_AGE_MS) throw new Error("STOPPAY รับเฉพาะรายการที่ชำระไม่เกิน 24 ชั่วโมง");

  const db = getD1();
  async function queryWindow(seconds: number) {
    const from = new Date(paidAt.getTime() - seconds * 1000);
    const to = new Date(paidAt.getTime() + seconds * 1000);
    const result = await db.prepare(`
      SELECT o.id AS operation_id, o.gateway_reference, o.client_reference, o.amount_cents,
             o.method, o.updated_at AS paid_at, o.response_json,
             c.merchant_id, c.merchant_name, c.merchant_reference
      FROM chatpos_gateway_operations o
      JOIN chatpos_merchant_configs c ON c.merchant_id = o.merchant_id
      WHERE o.operation_type = 'payment'
        AND o.status = 'success'
        AND o.amount_cents = ?
        AND datetime(o.updated_at) BETWEEN datetime(?) AND datetime(?)
      ORDER BY ABS(strftime('%s', o.updated_at) - strftime('%s', ?)) ASC
      LIMIT 8
    `).bind(amountCents, isoSql(from), isoSql(to), isoSql(paidAt)).all();
    return (result.results ?? []) as AnyRow[];
  }

  let rows = await queryWindow(MATCH_WINDOW_SECONDS);
  if (!rows.length) rows = await queryWindow(FALLBACK_WINDOW_SECONDS);
  const ref = String(input.slipReference ?? "").trim();
  if (rows.length > 1 && ref) {
    const exact = rows.filter((row) =>
      String(row.gateway_reference ?? "").includes(ref) ||
      String(row.client_reference ?? "").includes(ref) ||
      String(row.response_json ?? "").includes(ref)
    );
    if (exact.length === 1) rows = exact;
  }
  if (!rows.length) throw new Error("ไม่พบรายการ ChatPOS ที่ตรงกับยอดและวันเวลาบนสลิป");
  if (rows.length !== 1) throw new Error("พบมากกว่า 1 รายการ กรุณาตรวจเลขที่รายการบนสลิปหรือติดต่อทีม ChatPOS");

  const row = rows[0];
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await db.prepare(`
    INSERT INTO stoppay_lookups
      (token, operation_id, merchant_id, amount_cents, paid_at, slip_reference, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+30 minutes'))
  `).bind(
    token,
    String(row.operation_id),
    String(row.merchant_id),
    amountCents,
    paidAt.toISOString(),
    ref || null,
  ).run();

  return {
    lookupToken: token,
    merchantName: String(row.merchant_name || "ร้านค้า ChatPOS"),
    merchantReference: String(row.merchant_reference || ""),
    amount: amountCents / 100,
    paidAt: paidAt.toISOString(),
    method: String(row.method || ""),
    slipReference: ref || null,
  };
}

export async function getLookup(token: string) {
  await ensureStopPaySchema();
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  return await getD1().prepare(`
    SELECT l.*, o.gateway_reference
    FROM stoppay_lookups l
    JOIN chatpos_gateway_operations o ON o.id = l.operation_id
    WHERE l.token = ? AND l.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).bind(token).first() as AnyRow | null;
}

function smsAuth() {
  const username = envValue("SMSUP_USERNAME");
  const password = envValue("SMSUP_PASSWORD");
  const otcId = envValue("SMSUP_OTP_OTC_ID");
  if (!username || !password || !otcId) throw new Error("ยังไม่ได้ตั้งค่า SMS UP+ OTP");
  return { authorization: "Basic " + btoa(username + ":" + password), otcId };
}

export async function requestStopPayIdentityOtp(input: { phone: string; firstName: string; lastName: string }) {
  await ensureStopPaySchema();
  const phone = normalizeThaiMobile(input.phone);
  const firstName = String(input.firstName ?? "").trim().slice(0, 80);
  const lastName = String(input.lastName ?? "").trim().slice(0, 80);
  if (!/^0\d{9}$/.test(phone)) throw new Error("กรุณากรอกเบอร์มือถือ 10 หลัก");
  if (firstName.length < 2 || lastName.length < 2) throw new Error("กรุณากรอกชื่อและนามสกุล");

  const db = getD1();
  const recent = await db.prepare(
    "SELECT COUNT(*) AS total FROM stoppay_identity_sessions WHERE phone = ? AND created_at >= datetime('now', '-10 minutes')"
  ).bind(phone).first();
  if (Number(recent?.total ?? 0) >= 4) throw new Error("ขอ OTP เกินกำหนด กรุณารอ 10 นาที");

  const { authorization, otcId } = smsAuth();
  const baseUrl = envValue("SMSUP_BASE_URL") || "https://pub.smsup-plus.com";
  const response = await fetch(baseUrl + "/otp/requestOTP", {
    method: "POST",
    headers: { authorization, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ otcId, mobile: toSmsMobile(phone), callbackData: "ChatPOS STOPPAY IDENTITY" }),
  });
  const payload = await response.json() as any;
  const otpId = String(payload?.otpId ?? "");
  if (!response.ok || !otpId) throw new Error(payload?.error?.message || "ส่ง OTP ไม่สำเร็จ");

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO stoppay_identity_sessions
      (id, phone, first_name, last_name, otp_id, reference_code, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+10 minutes'))
  `).bind(id, phone, firstName, lastName, otpId, String(payload?.referenceCode ?? "") || null).run();

  return { sessionId: id, referenceCode: String(payload?.referenceCode ?? "") };
}

export async function verifyStopPayIdentityOtp(input: { sessionId: string; otpCode: string }) {
  await ensureStopPaySchema();
  const db = getD1();
  const session = await db.prepare(
    "SELECT * FROM stoppay_identity_sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1"
  ).bind(input.sessionId).first() as AnyRow | null;
  if (!session) throw new Error("OTP หมดอายุ กรุณาขอใหม่");
  if (session.verified_at) return { identityToken: String(session.id) };

  const attempts = Number(session.attempt_count ?? 0);
  if (attempts >= 8) throw new Error("กรอก OTP ผิดเกินกำหนด กรุณาขอรหัสใหม่");
  await db.prepare("UPDATE stoppay_identity_sessions SET attempt_count = attempt_count + 1 WHERE id = ?").bind(input.sessionId).run();

  const { authorization } = smsAuth();
  const baseUrl = envValue("SMSUP_BASE_URL") || "https://pub.smsup-plus.com";
  const response = await fetch(baseUrl + "/otp/verifyOTP", {
    method: "POST",
    headers: { authorization, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ otpId: String(session.otp_id), otpCode: String(input.otpCode ?? "").trim() }),
  });
  const payload = await response.json() as any;
  if (!response.ok || payload?.result !== true) {
    throw new Error(payload?.error?.message || (payload?.isExprCode ? "OTP หมดอายุ" : "OTP ไม่ถูกต้อง"));
  }

  await db.prepare("UPDATE stoppay_identity_sessions SET verified_at = CURRENT_TIMESTAMP, expires_at = datetime('now', '+30 minutes') WHERE id = ?").bind(input.sessionId).run();
  return { identityToken: String(session.id) };
}

export async function getVerifiedStopPayIdentity(token: string) {
  await ensureStopPaySchema();
  return await getD1().prepare(`
    SELECT * FROM stoppay_identity_sessions
    WHERE id = ? AND verified_at IS NOT NULL AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).bind(token).first() as AnyRow | null;
}

export async function activeStopPayHoldCents(merchantId: string) {
  await ensureStopPaySchema();
  const row = await getD1().prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS held_cents
    FROM stoppay_cases
    WHERE merchant_id = ?
      AND hold_requested_at IS NOT NULL
      AND resolved_at IS NULL
      AND status IN ('team_review_required', 'under_team_review', 'refund_review_requested', 'review_required')
  `).bind(merchantId).first();
  return Math.max(0, Number(row?.held_cents ?? 0));
}

export async function requestStopPayOtp(input: { lookupToken: string; phone: string; name: string }) {
  const lookup = await getLookup(input.lookupToken);
  if (!lookup) throw new Error("ข้อมูลค้นหารายการหมดอายุ กรุณาส่งสลิปใหม่");
  const phone = normalizeThaiMobile(input.phone);
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!/^0\d{9}$/.test(phone)) throw new Error("กรุณากรอกเบอร์มือถือ 10 หลัก");
  if (name.length < 2) throw new Error("กรุณากรอกชื่อผู้แจ้ง");

  const db = getD1();
  const recent = await db.prepare(
    "SELECT COUNT(*) AS total FROM stoppay_otp_sessions WHERE phone = ? AND created_at >= datetime('now', '-10 minutes')"
  ).bind(phone).first();
  if (Number(recent?.total ?? 0) >= 4) throw new Error("ขอ OTP เกินกำหนด กรุณารอ 10 นาที");

  const { authorization, otcId } = smsAuth();
  const baseUrl = envValue("SMSUP_BASE_URL") || "https://pub.smsup-plus.com";
  const response = await fetch(baseUrl + "/otp/requestOTP", {
    method: "POST",
    headers: { authorization, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ otcId, mobile: toSmsMobile(phone), callbackData: "ChatPOS STOPPAY" }),
  });
  const payload = await response.json() as any;
  const otpId = String(payload?.otpId ?? "");
  if (!response.ok || !otpId) throw new Error(payload?.error?.message || "ส่ง OTP ไม่สำเร็จ");

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO stoppay_otp_sessions
      (id, lookup_token, phone, reporter_name, otp_id, reference_code, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+10 minutes'))
  `).bind(id, input.lookupToken, phone, name, otpId, String(payload?.referenceCode ?? "") || null).run();
  return { sessionId: id, referenceCode: String(payload?.referenceCode ?? "") };
}

export async function verifyStopPayOtp(input: { sessionId: string; otpCode: string }) {
  await ensureStopPaySchema();
  const db = getD1();
  const session = await db.prepare(
    "SELECT * FROM stoppay_otp_sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1"
  ).bind(input.sessionId).first() as AnyRow | null;
  if (!session) throw new Error("OTP หมดอายุ กรุณาขอใหม่");
  if (session.verified_at) return { verificationToken: String(session.id) };

  const attempts = Number(session.attempt_count ?? 0);
  if (attempts >= 8) throw new Error("กรอก OTP ผิดเกินกำหนด กรุณาขอรหัสใหม่");
  await db.prepare("UPDATE stoppay_otp_sessions SET attempt_count = attempt_count + 1 WHERE id = ?").bind(input.sessionId).run();

  const { authorization } = smsAuth();
  const baseUrl = envValue("SMSUP_BASE_URL") || "https://pub.smsup-plus.com";
  const response = await fetch(baseUrl + "/otp/verifyOTP", {
    method: "POST",
    headers: { authorization, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ otpId: String(session.otp_id), otpCode: String(input.otpCode ?? "").trim() }),
  });
  const payload = await response.json() as any;
  if (!response.ok || payload?.result !== true) {
    throw new Error(payload?.error?.message || (payload?.isExprCode ? "OTP หมดอายุ" : "OTP ไม่ถูกต้อง"));
  }
  await db.prepare("UPDATE stoppay_otp_sessions SET verified_at = CURRENT_TIMESTAMP WHERE id = ?").bind(input.sessionId).run();
  return { verificationToken: String(session.id) };
}

export async function getVerifiedSession(token: string) {
  await ensureStopPaySchema();
  return await getD1().prepare(`
    SELECT s.*, l.operation_id, l.merchant_id, l.amount_cents, l.paid_at, l.slip_reference,
           o.gateway_reference
    FROM stoppay_otp_sessions s
    JOIN stoppay_lookups l ON l.token = s.lookup_token
    JOIN chatpos_gateway_operations o ON o.id = l.operation_id
    WHERE s.id = ? AND s.verified_at IS NOT NULL AND s.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).bind(token).first() as AnyRow | null;
}

export function makeCaseNumber() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `SP-${y}${m}${day}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function promoteExpiredCasesForMerchant(merchantId: string) {
  await ensureStopPaySchema();
  const db = getD1();
  await db.prepare(`
    UPDATE stoppay_cases
    SET status = 'review_required',
        hold_requested_at = COALESCE(hold_requested_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
    WHERE merchant_id = ?
      AND status = 'merchant_action_required'
      AND merchant_contacted_at IS NULL
      AND merchant_contact_deadline <= CURRENT_TIMESTAMP
  `).bind(merchantId).run();
}
