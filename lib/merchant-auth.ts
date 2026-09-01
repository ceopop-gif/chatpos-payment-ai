import { getD1 } from "../db";

const SESSION_COOKIE = "chatpos_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_PASSWORD_ITERATIONS = 100000;

export type MerchantSession = {
  applicationId: string;
  username: string;
  firstName: string;
  lastName: string;
  status: string;
};

export function normalizeMobile(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("66") && digits.length === 11 ? "0" + digits.slice(2) : digits;
}

function cookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return "";
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyPassword(password: string, expectedHash: string, saltBase64: string, iterations: number) {
  if (!password || !expectedHash || !saltBase64 || !Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PASSWORD_ITERATIONS) {
    return false;
  }
  try {
    const salt = base64ToBytes(saltBase64);
    const expected = base64ToBytes(expectedHash);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const derivedBits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      keyMaterial,
      expected.length * 8,
    );
    const actual = new Uint8Array(derivedBits);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

export async function createMerchantSession(applicationId: string) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const hash = await tokenHash(token);
  const db = getD1();
  await db.batch([
    db.prepare("DELETE FROM merchant_sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    db.prepare("INSERT INTO merchant_sessions (token_hash, application_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))").bind(hash, applicationId),
  ]);
  return { token, maxAge: SESSION_MAX_AGE_SECONDS };
}

export function merchantSessionCookie(token: string, maxAge = SESSION_MAX_AGE_SECONDS) {
  return SESSION_COOKIE + "=" + encodeURIComponent(token)
    + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge + "; Priority=High";
}

export async function getMerchantSession(request: Request): Promise<MerchantSession | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const hash = await tokenHash(token);
  const row = await getD1().prepare(
    "SELECT a.id AS application_id, a.username, a.first_name, a.last_name, a.status FROM merchant_sessions s JOIN merchant_applications a ON a.id = s.application_id WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP LIMIT 1"
  ).bind(hash).first();
  if (!row?.application_id || !row.username) return null;
  return {
    applicationId: String(row.application_id),
    username: String(row.username),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    status: String(row.status),
  };
}

export async function deleteMerchantSession(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (/^[a-f0-9]{64}$/i.test(token)) {
    await getD1().prepare("DELETE FROM merchant_sessions WHERE token_hash = ?").bind(await tokenHash(token)).run();
  }
}

export function unauthorizedResponse() {
  return Response.json({ error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }, { status: 401 });
}
