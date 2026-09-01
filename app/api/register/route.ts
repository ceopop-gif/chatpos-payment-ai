import { getD1 } from "../../../db";

type RegistrationPayload = {
  phone?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  mapUrl?: string;
  businessDescription?: string;
  agentReference?: string;
  password?: string;
  confirmPassword?: string;
  consent?: boolean;
  clientRequestId?: string;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("66") && digits.length === 11 ? "0" + digits.slice(2) : digits;
}

function validCoordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function makeApplicationNumber() {
  const date = new Date();
  const datePart = [
    String(date.getUTCFullYear()).slice(-2),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return "CP-" + datePart + "-" + randomPart;
}

const PASSWORD_ITERATIONS = 100000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    keyMaterial,
    256,
  );
  return {
    hash: bytesToBase64(new Uint8Array(derivedBits)),
    salt: bytesToBase64(salt),
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegistrationPayload;
    const phone = normalizePhone(payload.phone);
    const username = normalizePhone(payload.username);
    const firstName = cleanText(payload.firstName, 80);
    const lastName = cleanText(payload.lastName, 80);
    const address = cleanText(payload.address, 600);
    const latitude = validCoordinate(payload.latitude, -90, 90);
    const longitude = validCoordinate(payload.longitude, -180, 180);
    const accuracy = validCoordinate(payload.accuracy, 0, 100000);
    const mapUrl = cleanText(payload.mapUrl, 800);
    const businessDescription = cleanText(payload.businessDescription, 1000);
    const rawAgentReference = cleanText(payload.agentReference, 24).toUpperCase();
    const agentPhone = normalizePhone(rawAgentReference);
    const agentCode = rawAgentReference.replace(/[^A-Z0-9-]/g, "");
    const password = String(payload.password ?? "");
    const confirmPassword = String(payload.confirmPassword ?? "");
    const clientRequestId = cleanText(payload.clientRequestId, 80);
    const hasCoordinates = latitude !== null && longitude !== null;
    const hasMapLink = /^https?:\/\//i.test(mapUrl);

    if (!/^0[689]\d{8}$/.test(phone)) return Response.json({ error: "กรุณากรอกเบอร์มือถือ 10 หลักให้ถูกต้อง" }, { status: 400 });
    if (username !== phone) return Response.json({ error: "Username ต้องเป็นเบอร์มือถือที่สมัครเท่านั้น" }, { status: 400 });
    if (firstName.length < 2 || lastName.length < 2) return Response.json({ error: "กรุณากรอกชื่อและนามสกุล" }, { status: 400 });
    if (address.length < 10) return Response.json({ error: "กรุณากรอกที่อยู่ร้านให้ครบถ้วน" }, { status: 400 });
    if (!hasCoordinates && !hasMapLink) return Response.json({ error: "กรุณาปักหมุดร้าน หรือวางลิงก์ Google Maps" }, { status: 400 });
    if (businessDescription.length < 5) return Response.json({ error: "กรุณาอธิบายว่าร้านขายสินค้าหรือบริการอะไร" }, { status: 400 });
    if (password.length < 8 || password.length > 128 || !/\d/.test(password) || !/[^\d\s]/u.test(password)) {
      return Response.json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัว และมีทั้งตัวอักษรกับตัวเลข" }, { status: 400 });
    }
    if (password !== confirmPassword) return Response.json({ error: "รหัสผ่านทั้ง 2 ช่องไม่ตรงกัน" }, { status: 400 });
    if (payload.consent !== true) return Response.json({ error: "กรุณายืนยันข้อมูลและยินยอมให้ทีมงานติดต่อกลับ" }, { status: 400 });
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(clientRequestId)) return Response.json({ error: "ข้อมูลใบสมัครไม่ครบ กรุณาลองใหม่" }, { status: 400 });

    const db = getD1();
    const existing = await db.prepare(
      "SELECT application_number, status, created_at FROM merchant_applications WHERE client_request_id = ? LIMIT 1"
    ).bind(clientRequestId).first();

    if (existing) {
      return Response.json({
        registration: {
          applicationNumber: String(existing.application_number),
          status: String(existing.status),
          submittedAt: String(existing.created_at),
        },
      });
    }

    const duplicateUsername = await db.prepare(
      "SELECT application_number FROM merchant_applications WHERE username = ? LIMIT 1"
    ).bind(username).first();
    if (duplicateUsername) {
      return Response.json({ error: "เบอร์มือถือนี้ถูกใช้สมัครแล้ว กรุณาใช้บัญชีเดิมหรือติดต่อทีมงาน" }, { status: 409 });
    }

    let agentId: string | null = null;
    let matchedAgentReference = "";
    if (rawAgentReference) {
      const matchedAgent = await db.prepare(
        "SELECT id, code FROM agents WHERE status = 'active' AND (phone = ? OR code = ?) LIMIT 1"
      ).bind(agentPhone, agentCode).first();
      if (!matchedAgent) {
        return Response.json({ error: "ไม่พบเบอร์มือถือหรือรหัสตัวแทนนี้ กรุณาตรวจสอบอีกครั้ง หรือเว้นว่างเพื่อให้หลังบ้านผูกตัวแทนภายหลัง" }, { status: 400 });
      }
      agentId = String(matchedAgent.id);
      matchedAgentReference = String(matchedAgent.code);
    }

    const id = crypto.randomUUID();
    const applicationNumber = makeApplicationNumber();
    const passwordCredential = await hashPassword(password);
    const row = await db.prepare(
      "INSERT INTO merchant_applications (id, application_number, client_request_id, phone, username, password_hash, password_salt, password_iterations, first_name, last_name, address, latitude, longitude, location_accuracy_m, map_url, business_description, agent_id, agent_reference, consent, status, kyc_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'submitted', 'pending') RETURNING application_number, status, created_at"
    ).bind(
      id,
      applicationNumber,
      clientRequestId,
      phone,
      username,
      passwordCredential.hash,
      passwordCredential.salt,
      PASSWORD_ITERATIONS,
      firstName,
      lastName,
      address,
      latitude,
      longitude,
      accuracy,
      mapUrl,
      businessDescription,
      agentId,
      matchedAgentReference,
    ).first();

    return Response.json({
      registration: {
        applicationNumber: String(row?.application_number ?? applicationNumber),
        status: String(row?.status ?? "submitted"),
        submittedAt: String(row?.created_at ?? new Date().toISOString()),
      },
    }, { status: 201 });
  } catch {
    return Response.json({
      error: "ระบบยังบันทึกใบสมัครไม่สำเร็จ กรุณากดส่งใบสมัครอีกครั้ง หากยังไม่สำเร็จให้ปิดหน้าแล้วเปิดลิงก์ใหม่ หรือติดต่อทีมงาน",
    }, { status: 500 });
  }
}
