import { env } from "cloudflare:workers";
import { getD1 } from "../db";

const ADMIN_COOKIE = "chatpos_admin_session";
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

type AdminEnvironment = {
  CHATPOS_ADMIN_USERNAME?: string;
  CHATPOS_ADMIN_PASSWORD?: string;
};

function credentials() {
  const values = env as unknown as AdminEnvironment;
  return {
    username: String(values.CHATPOS_ADMIN_USERNAME ?? "").trim(),
    password: String(values.CHATPOS_ADMIN_PASSWORD ?? ""),
  };
}

function cookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return "";
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function secureEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let difference = leftHash.length ^ rightHash.length;
  const size = Math.max(leftHash.length, rightHash.length);
  for (let index = 0; index < size; index += 1) {
    difference |= (leftHash.charCodeAt(index) || 0) ^ (rightHash.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function adminCredentialsConfigured() {
  const configured = credentials();
  return configured.username.length >= 4 && configured.password.length >= 5;
}

export async function verifyAdminCredentials(username: string, password: string) {
  const configured = credentials();
  if (!adminCredentialsConfigured()) return false;
  const [usernameMatches, passwordMatches] = await Promise.all([
    secureEqual(username.trim(), configured.username),
    secureEqual(password, configured.password),
  ]);
  return usernameMatches && passwordMatches;
}

export async function createAdminSession(username: string) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const hash = await sha256(token);
  const db = getD1();
  await db.batch([
    db.prepare("DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    db.prepare("INSERT INTO admin_sessions (token_hash, username, expires_at) VALUES (?, ?, datetime('now', '+8 hours'))").bind(hash, username),
  ]);
  return { token, maxAge: ADMIN_SESSION_SECONDS };
}

export function adminSessionCookie(token: string, maxAge = ADMIN_SESSION_SECONDS) {
  return ADMIN_COOKIE + "=" + encodeURIComponent(token)
    + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge + "; Priority=High";
}

export async function getAdminSession(request: Request) {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const row = await getD1().prepare(
    "SELECT username FROM admin_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1"
  ).bind(await sha256(token)).first();
  return row?.username ? { username: String(row.username) } : null;
}

export async function deleteAdminSession(request: Request) {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (/^[a-f0-9]{64}$/i.test(token)) {
    await getD1().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
}

export function adminUnauthorized() {
  return Response.json({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, { status: 401 });
}
