import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";
import {
  agentDirectoryConfigured, isAgentPhone, lookupDirectoryAgent, normalizeAgentPhone,
} from "../../../../lib/agent-directory";

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
}

async function localAgentByPhone(phone: string) {
  return getD1().prepare(
    "SELECT id, code, phone, name, external_id, source, synced_at, status, note, created_at FROM agents WHERE phone = ? LIMIT 1"
  ).bind(phone).first();
}

async function availableCode(phone: string, requested?: string) {
  const requestedCode = normalizeCode(requested);
  const preferred = /^[A-Z0-9][A-Z0-9-]{3,23}$/.test(requestedCode) ? requestedCode : `AG${phone.slice(-6)}`;
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? preferred : `${preferred.slice(0, 20)}-${suffix}`;
    const exists = await getD1().prepare("SELECT 1 FROM agents WHERE code = ? LIMIT 1").bind(candidate).first();
    if (!exists) return candidate;
  }
  return `AG${Date.now().toString(36).toUpperCase()}`.slice(0, 24);
}

export async function GET(request: Request) {
  try {
    if (!(await getAdminSession(request))) return adminUnauthorized();
    const phone = normalizeAgentPhone(new URL(request.url).searchParams.get("phone"));
    if (!isAgentPhone(phone)) return Response.json({ error: "กรุณากรอกเบอร์มือถือตัวแทน 10 หลัก" }, { status: 400 });

    const local = await localAgentByPhone(phone);
    if (local) return Response.json({ found: true, source: "local", agent: local, externalConfigured: agentDirectoryConfigured() });

    const externalConfigured = agentDirectoryConfigured();
    if (!externalConfigured) return Response.json({ found: false, externalConfigured });
    const external = await lookupDirectoryAgent(phone);
    return Response.json({ found: Boolean(external), source: external ? "external" : null, agent: external, externalConfigured });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("AGENT_DIRECTORY_")) {
      return Response.json({ error: "เชื่อมต่อระบบตัวแทนกลางไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 502 });
    }
    return Response.json({ error: "ค้นหาตัวแทนไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await getAdminSession(request))) return adminUnauthorized();
    const payload = (await request.json()) as { action?: string; name?: string; phone?: string; code?: string; note?: string };
    const phone = normalizeAgentPhone(payload.phone);
    if (!isAgentPhone(phone)) return Response.json({ error: "กรุณากรอกเบอร์มือถือตัวแทน 10 หลัก" }, { status: 400 });

    const existing = await localAgentByPhone(phone);
    if (existing) return Response.json({ agent: existing, alreadyExists: true });

    if (payload.action === "connect") {
      if (!agentDirectoryConfigured()) return Response.json({ error: "ยังไม่ได้ตั้งค่าการเชื่อมต่อระบบตัวแทนกลาง" }, { status: 503 });
      const external = await lookupDirectoryAgent(phone);
      if (!external) return Response.json({ error: "ไม่พบเบอร์นี้ในระบบตัวแทนกลาง" }, { status: 404 });
      const code = await availableCode(phone, external.code);
      const row = await getD1().prepare(`
        INSERT INTO agents (id, code, phone, name, external_id, source, synced_at, status, note)
        VALUES (?, ?, ?, ?, ?, 'external', CURRENT_TIMESTAMP, ?, ?)
        RETURNING id, code, phone, name, external_id, source, synced_at, status, note, created_at
      `).bind(crypto.randomUUID(), code, phone, external.name, external.externalId, external.status, external.note).first();
      return Response.json({ agent: row }, { status: 201 });
    }

    const name = cleanText(payload.name, 100);
    const note = cleanText(payload.note, 500);
    if (name.length < 2) return Response.json({ error: "กรุณากรอกชื่อตัวแทน" }, { status: 400 });
    if (payload.code && !/^[A-Z0-9][A-Z0-9-]{3,23}$/.test(normalizeCode(payload.code))) {
      return Response.json({ error: "รหัสตัวแทนต้องมี 4–24 ตัว ใช้ A-Z, 0-9 หรือขีดกลาง" }, { status: 400 });
    }
    const code = await availableCode(phone, payload.code);
    const row = await getD1().prepare(`
      INSERT INTO agents (id, code, phone, name, source, note)
      VALUES (?, ?, ?, ?, 'local', ?)
      RETURNING id, code, phone, name, external_id, source, synced_at, status, note, created_at
    `).bind(crypto.randomUUID(), code, phone, name, note).first();
    return Response.json({ agent: row }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เพิ่มตัวแทนไม่สำเร็จ";
    if (/unique|constraint/i.test(message)) return Response.json({ error: "เบอร์มือถือ รหัส หรือบัญชีตัวแทนนี้มีในระบบแล้ว" }, { status: 409 });
    if (message.startsWith("AGENT_DIRECTORY_")) return Response.json({ error: "เชื่อมต่อระบบตัวแทนกลางไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 502 });
    return Response.json({ error: "เพิ่มตัวแทนไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await getAdminSession(request))) return adminUnauthorized();
    const payload = (await request.json()) as { id?: string; name?: string; phone?: string; code?: string; note?: string; status?: string };
    const id = cleanText(payload.id, 80);
    const name = cleanText(payload.name, 100);
    const phone = normalizeAgentPhone(payload.phone);
    const code = normalizeCode(payload.code);
    const note = cleanText(payload.note, 500);
    const status = payload.status === "inactive" ? "inactive" : "active";
    if (!id) return Response.json({ error: "ไม่พบตัวแทน" }, { status: 400 });
    if (name.length < 2 || !isAgentPhone(phone) || !/^[A-Z0-9][A-Z0-9-]{3,23}$/.test(code)) {
      return Response.json({ error: "กรุณาตรวจชื่อ เบอร์มือถือ และรหัสตัวแทน" }, { status: 400 });
    }
    const row = await getD1().prepare(
      "UPDATE agents SET code = ?, phone = ?, name = ?, status = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING id, code, phone, name, external_id, source, synced_at, status, note, created_at"
    ).bind(code, phone, name, status, note, id).first();
    if (!row) return Response.json({ error: "ไม่พบตัวแทน" }, { status: 404 });
    return Response.json({ agent: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "แก้ไขตัวแทนไม่สำเร็จ";
    if (/unique|constraint/i.test(message)) return Response.json({ error: "เบอร์มือถือหรือรหัสตัวแทนนี้ซ้ำ" }, { status: 409 });
    return Response.json({ error: "แก้ไขตัวแทนไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 500 });
  }
}
