import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";
import { ensureChatPosHubSchema } from "../../../../lib/chatposhub";

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export async function GET(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureChatPosHubSchema();
    const db = getD1();
    const result = await db.prepare(`
      SELECT g.id, g.name, g.status, g.default_daily_limit_cents, g.created_at,
             COUNT(CASE WHEN m.status = 'active' THEN 1 END) AS member_count
      FROM chatposhub_groups g
      LEFT JOIN chatposhub_group_members m ON m.group_id = g.id
      WHERE g.status = 'active'
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `).all();
    return Response.json({ groups: result.results ?? [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดกลุ่มไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureChatPosHubSchema();
    const payload = (await request.json()) as { name?: string; defaultDailyLimit?: number };
    const name = cleanText(payload.name, 120);
    const defaultDailyLimit = Number(payload.defaultDailyLimit ?? 50000);
    if (name.length < 2) return Response.json({ error: "กรุณาตั้งชื่อกลุ่ม" }, { status: 400 });
    if (!Number.isFinite(defaultDailyLimit) || defaultDailyLimit <= 0 || defaultDailyLimit > 100000000) {
      return Response.json({ error: "วงเงินต่อวันไม่ถูกต้อง" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const db = getD1();
    await db.batch([
      db.prepare("INSERT INTO chatposhub_groups (id, name, default_daily_limit_cents, created_by) VALUES (?, ?, ?, ?)")
        .bind(id, name, Math.round(defaultDailyLimit * 100), admin.username),
      db.prepare("INSERT INTO chatposhub_audit_logs (id, group_id, action, detail, actor) VALUES (?, ?, 'group.created', ?, ?)")
        .bind(crypto.randomUUID(), id, JSON.stringify({ name, defaultDailyLimit }), admin.username),
    ]);
    return Response.json({ created: true, group: { id, name, defaultDailyLimit } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "สร้างกลุ่มไม่สำเร็จ" }, { status: 500 });
  }
}
