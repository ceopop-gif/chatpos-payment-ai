import { getD1 } from "../../../db";
import { adminUnauthorized, getAdminSession } from "../../../lib/admin-auth";
import { ensureChatPosHubSchema, normalizeThaiPhone } from "../../../lib/chatposhub";

export async function GET(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureChatPosHubSchema();
    const db = getD1();
    const rows = await db.prepare(`
      SELECT b.phone, b.status, b.note, b.cancelled_by, b.cancelled_at,
             a.id AS merchant_id, a.first_name, a.last_name, a.business_description, a.kyc_status, a.status AS account_status
      FROM otp_bypass_phones b
      LEFT JOIN merchant_applications a ON a.phone = b.phone
      WHERE b.status = 'active'
      ORDER BY b.cancelled_at DESC
    `).all();
    return Response.json({ rows: rows.results ?? [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดรายการยกเลิก OTP ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureChatPosHubSchema();
    const payload = (await request.json()) as { phone?: string; note?: string };
    const phone = normalizeThaiPhone(payload.phone);
    const note = String(payload.note ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
    if (!/^0\d{9}$/.test(phone)) return Response.json({ error: "กรุณากรอกเบอร์มือถือ 10 หลัก" }, { status: 400 });

    const db = getD1();
    const merchant = await db.prepare(`
      SELECT id, phone, first_name, last_name, business_description, kyc_status, status
      FROM merchant_applications
      WHERE phone = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(phone).first();
    if (!merchant) return Response.json({ error: "ไม่พบเบอร์นี้ในฐานข้อมูลร้านค้า ChatPOS" }, { status: 404 });

    await db.prepare(`
      INSERT INTO otp_bypass_phones (phone, status, note, cancelled_by, cancelled_at, updated_at)
      VALUES (?, 'active', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(phone) DO UPDATE SET
        status = 'active',
        note = excluded.note,
        cancelled_by = excluded.cancelled_by,
        cancelled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).bind(phone, note, admin.username).run();

    return Response.json({
      updated: true,
      merchant: {
        id: String(merchant.id),
        phone: String(merchant.phone),
        name: [merchant.first_name, merchant.last_name].filter(Boolean).join(" ").trim(),
        businessDescription: String(merchant.business_description ?? ""),
        kycStatus: String(merchant.kyc_status ?? ""),
        accountStatus: String(merchant.status ?? ""),
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ยกเลิก OTP ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureChatPosHubSchema();
    const payload = (await request.json()) as { phone?: string };
    const phone = normalizeThaiPhone(payload.phone);
    if (!/^0\d{9}$/.test(phone)) return Response.json({ error: "เบอร์มือถือไม่ถูกต้อง" }, { status: 400 });
    const db = getD1();

    const activeGroup = await db.prepare(`
      SELECT g.name
      FROM chatposhub_group_members m
      JOIN chatposhub_groups g ON g.id = m.group_id
      WHERE m.phone = ? AND m.status = 'active' AND g.status = 'active'
      LIMIT 1
    `).bind(phone).first();
    if (activeGroup) {
      return Response.json({ error: `เบอร์นี้ยังอยู่ในกลุ่ม "${String(activeGroup.name)}" กรุณานำออกจากกลุ่มก่อนเปิด OTP กลับ` }, { status: 409 });
    }

    await db.prepare("UPDATE otp_bypass_phones SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE phone = ?").bind(phone).run();
    return Response.json({ cancelled: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เปิด OTP กลับไม่สำเร็จ" }, { status: 500 });
  }
}
