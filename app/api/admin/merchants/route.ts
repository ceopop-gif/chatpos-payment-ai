import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export async function PATCH(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    const payload = (await request.json()) as { applicationId?: string; action?: string; agentId?: string | null; note?: string };
    const applicationId = cleanText(payload.applicationId, 80);
    const action = cleanText(payload.action, 30);
    const agentId = cleanText(payload.agentId, 80) || null;
    const note = cleanText(payload.note, 1000);
    const db = getD1();
    const current = await db.prepare(
      "SELECT id, kyc_status, agent_id FROM merchant_applications WHERE id = ? LIMIT 1"
    ).bind(applicationId).first();
    if (!current) return Response.json({ error: "ไม่พบร้านค้า" }, { status: 404 });

    if (action === "bind_agent") {
      if (!agentId) return Response.json({ error: "กรุณาเลือกตัวแทน" }, { status: 400 });
      const agent = await db.prepare("SELECT id FROM agents WHERE id = ? AND status = 'active' LIMIT 1").bind(agentId).first();
      if (!agent) return Response.json({ error: "ไม่พบตัวแทนที่เปิดใช้งาน" }, { status: 404 });
      await db.batch([
        db.prepare("UPDATE merchant_applications SET agent_id = ?, agent_reference = (SELECT code FROM agents WHERE id = ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(agentId, agentId, applicationId),
        db.prepare("INSERT INTO kyc_reviews (id, application_id, action, previous_status, next_status, agent_id, note, reviewed_by) VALUES (?, ?, 'bind_agent', ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), applicationId, String(current.kyc_status), String(current.kyc_status), agentId, note, admin.username),
      ]);
      return Response.json({ updated: true });
    }

    if (action === "approve") {
      const resolvedAgentId = agentId ?? (current.agent_id ? String(current.agent_id) : null);
      if (!resolvedAgentId) {
        return Response.json({ error: "ยังอนุมัติ KYC ไม่ได้ กรุณาผูกเบอร์มือถือหรือรหัสตัวแทนก่อน" }, { status: 409 });
      }
      const agent = await db.prepare("SELECT id FROM agents WHERE id = ? AND status = 'active' LIMIT 1").bind(resolvedAgentId).first();
      if (!agent) return Response.json({ error: "ตัวแทนไม่พร้อมใช้งาน กรุณาเลือกตัวแทนใหม่" }, { status: 409 });
      await db.batch([
        db.prepare("UPDATE merchant_applications SET agent_id = ?, kyc_status = 'approved', kyc_note = ?, status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(resolvedAgentId, note, admin.username, applicationId),
        db.prepare("INSERT INTO kyc_reviews (id, application_id, action, previous_status, next_status, agent_id, note, reviewed_by) VALUES (?, ?, 'approve', ?, 'approved', ?, ?, ?)").bind(crypto.randomUUID(), applicationId, String(current.kyc_status), resolvedAgentId, note, admin.username),
      ]);
      return Response.json({ updated: true });
    }

    if (action === "reject" || action === "pending" || action === "suspend") {
      const nextStatus = action === "suspend" ? "suspended" : action;
      const accountStatus = action === "suspend" ? "suspended" : action === "pending" ? "submitted" : "rejected";
      await db.batch([
        db.prepare("UPDATE merchant_applications SET kyc_status = ?, kyc_note = ?, status = ?, approved_at = CASE WHEN ? = 'approved' THEN approved_at ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(nextStatus, note, accountStatus, nextStatus, applicationId),
        db.prepare("INSERT INTO kyc_reviews (id, application_id, action, previous_status, next_status, agent_id, note, reviewed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), applicationId, action, String(current.kyc_status), nextStatus, current.agent_id ?? null, note, admin.username),
      ]);
      return Response.json({ updated: true });
    }

    return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อัปเดตร้านค้าไม่สำเร็จ" }, { status: 500 });
  }
}
