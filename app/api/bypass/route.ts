import { getD1 } from "../../../db";
import { adminUnauthorized, getAdminSession } from "../../../lib/admin-auth";
import { ensureChatPosHubSchema, normalizeThaiPhone } from "../../../lib/chatposhub";

function cleanNote(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
}

export async function GET(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureChatPosHubSchema();
    const db = getD1();
    const rows = await db.prepare(`
      WITH latest_merchant AS (
        SELECT
          id, phone, first_name, last_name, business_description, kyc_status, status,
          ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at DESC) AS rn
        FROM merchant_applications
      )
      SELECT
        b.phone, b.status, b.note, b.cancelled_by, b.cancelled_at,
        a.id AS merchant_id, a.first_name, a.last_name, a.business_description,
        a.kyc_status, a.status AS account_status,
        m.id AS group_member_id, m.group_id AS current_group_id,
        g.name AS current_group_name
      FROM otp_bypass_phones b
      LEFT JOIN latest_merchant a ON a.phone = b.phone AND a.rn = 1
      LEFT JOIN chatposhub_group_members m ON m.phone = b.phone AND m.status = 'active'
      LEFT JOIN chatposhub_groups g ON g.id = m.group_id AND g.status = 'active'
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
    const note = cleanNote(payload.note);
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

export async function PATCH(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureChatPosHubSchema();

    const payload = (await request.json()) as {
      oldPhone?: string;
      phone?: string;
      note?: string;
      groupId?: string | null;
    };
    const oldPhone = normalizeThaiPhone(payload.oldPhone);
    const phone = normalizeThaiPhone(payload.phone);
    const note = cleanNote(payload.note);
    const groupId = String(payload.groupId ?? "").trim();

    if (!/^0\d{9}$/.test(oldPhone) || !/^0\d{9}$/.test(phone)) {
      return Response.json({ error: "กรุณากรอกเบอร์มือถือ 10 หลัก" }, { status: 400 });
    }

    const db = getD1();
    const bypass = await db.prepare("SELECT phone FROM otp_bypass_phones WHERE phone = ? AND status = 'active' LIMIT 1")
      .bind(oldPhone).first();
    if (!bypass) return Response.json({ error: "ไม่พบเบอร์ยกเว้น OTP ที่ต้องการแก้ไข" }, { status: 404 });

    const merchant = await db.prepare(`
      SELECT id, phone, first_name, last_name, business_description, kyc_status, status
      FROM merchant_applications
      WHERE phone = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(phone).first();
    if (!merchant) return Response.json({ error: "เบอร์ใหม่ต้องเป็นเบอร์ร้านค้าที่มีอยู่ในฐานข้อมูล ChatPOS" }, { status: 404 });

    if (oldPhone !== phone) {
      const duplicate = await db.prepare("SELECT phone FROM otp_bypass_phones WHERE phone = ? AND status = 'active' LIMIT 1")
        .bind(phone).first();
      if (duplicate) return Response.json({ error: "เบอร์ใหม่นี้ถูกยกเว้น OTP อยู่แล้ว" }, { status: 409 });
    }

    let selectedGroup: Record<string, unknown> | null = null;
    if (groupId) {
      selectedGroup = await db.prepare("SELECT id, name, default_daily_limit_cents FROM chatposhub_groups WHERE id = ? AND status = 'active' LIMIT 1")
        .bind(groupId).first();
      if (!selectedGroup) return Response.json({ error: "ไม่พบกลุ่ม ChatPOS Hub ที่เลือก" }, { status: 404 });
      if (String(merchant.kyc_status ?? "") !== "approved" || String(merchant.status ?? "") !== "approved") {
        return Response.json({ error: "ร้านนี้ยังไม่ผ่าน KYC หรือบัญชียังไม่พร้อม จึงยังเพิ่มเข้ากลุ่มไม่ได้" }, { status: 409 });
      }
    }

    const currentMember = await db.prepare(`
      SELECT m.id, m.group_id, m.merchant_id, m.phone, g.name
      FROM chatposhub_group_members m
      LEFT JOIN chatposhub_groups g ON g.id = m.group_id
      WHERE m.phone = ? AND m.status = 'active'
      LIMIT 1
    `).bind(oldPhone).first();

    if (groupId) {
      const conflict = await db.prepare(`
        SELECT m.id, m.group_id, g.name
        FROM chatposhub_group_members m
        JOIN chatposhub_groups g ON g.id = m.group_id
        WHERE m.phone = ? AND m.status = 'active' AND m.id <> ?
        LIMIT 1
      `).bind(phone, String(currentMember?.id ?? "")).first();
      if (conflict) {
        return Response.json({ error: `เบอร์นี้อยู่ในกลุ่ม "${String(conflict.name)}" แล้ว กรุณานำออกจากกลุ่มเดิมก่อน` }, { status: 409 });
      }
    }

    const statements = [];

    if (oldPhone === phone) {
      statements.push(
        db.prepare("UPDATE otp_bypass_phones SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE phone = ?")
          .bind(note, oldPhone),
      );
    } else {
      statements.push(
        db.prepare(`
          INSERT INTO otp_bypass_phones (phone, status, note, cancelled_by, cancelled_at, updated_at)
          VALUES (?, 'active', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(phone, note, admin.username),
        db.prepare("UPDATE otp_bypass_phones SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE phone = ?")
          .bind(oldPhone),
      );
    }

    const currentGroupId = String(currentMember?.group_id ?? "");
    if (currentMember && !groupId) {
      statements.push(
        db.prepare("UPDATE chatposhub_group_members SET status = 'removed', removed_by = ?, removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(admin.username, String(currentMember.id)),
        db.prepare(`INSERT INTO chatposhub_audit_logs
          (id, group_id, merchant_id, phone, action, detail, actor)
          VALUES (?, ?, ?, ?, 'member.removed', ?, ?)`)
          .bind(
            crypto.randomUUID(),
            currentGroupId,
            String(currentMember.merchant_id),
            oldPhone,
            JSON.stringify({ source: "bypass.edit", reason: "group_changed" }),
            admin.username,
          ),
      );
    } else if (currentMember && groupId === currentGroupId) {
      statements.push(
        db.prepare("UPDATE chatposhub_group_members SET merchant_id = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(String(merchant.id), phone, String(currentMember.id)),
      );
      if (oldPhone !== phone) {
        statements.push(
          db.prepare(`INSERT INTO chatposhub_audit_logs
            (id, group_id, merchant_id, phone, action, detail, actor)
            VALUES (?, ?, ?, ?, 'member.phone_changed', ?, ?)`)
            .bind(
              crypto.randomUUID(),
              groupId,
              String(merchant.id),
              phone,
              JSON.stringify({ oldPhone, newPhone: phone, source: "bypass.edit" }),
              admin.username,
            ),
        );
      }
    } else if (groupId) {
      if (currentMember) {
        statements.push(
          db.prepare("UPDATE chatposhub_group_members SET status = 'removed', removed_by = ?, removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(admin.username, String(currentMember.id)),
          db.prepare(`INSERT INTO chatposhub_audit_logs
            (id, group_id, merchant_id, phone, action, detail, actor)
            VALUES (?, ?, ?, ?, 'member.removed', ?, ?)`)
            .bind(
              crypto.randomUUID(),
              currentGroupId,
              String(currentMember.merchant_id),
              oldPhone,
              JSON.stringify({ source: "bypass.edit", movedToGroupId: groupId }),
              admin.username,
            ),
        );
      }

      const memberId = crypto.randomUUID();
      statements.push(
        db.prepare(`INSERT INTO chatposhub_group_members
          (id, group_id, merchant_id, phone, daily_limit_cents, added_by)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(
            memberId,
            groupId,
            String(merchant.id),
            phone,
            Number(selectedGroup?.default_daily_limit_cents ?? 5000000),
            admin.username,
          ),
        db.prepare(`INSERT INTO chatposhub_audit_logs
          (id, group_id, merchant_id, phone, action, detail, actor)
          VALUES (?, ?, ?, ?, 'member.added', ?, ?)`)
          .bind(
            crypto.randomUUID(),
            groupId,
            String(merchant.id),
            phone,
            JSON.stringify({ source: "bypass.edit", movedFromGroupId: currentGroupId || null }),
            admin.username,
          ),
      );
    }

    await db.batch(statements);

    return Response.json({
      updated: true,
      phone,
      group: groupId ? { id: groupId, name: String(selectedGroup?.name ?? "") } : null,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "แก้ไขข้อมูลไม่สำเร็จ" }, { status: 500 });
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
      return Response.json({ error: `เบอร์นี้ยังอยู่ในกลุ่ม "${String(activeGroup.name)}" กรุณาเลือก "ยังไม่เข้ากลุ่ม" และบันทึกก่อนเปิด OTP กลับ` }, { status: 409 });
    }

    await db.prepare("UPDATE otp_bypass_phones SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE phone = ?").bind(phone).run();
    return Response.json({ cancelled: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เปิด OTP กลับไม่สำเร็จ" }, { status: 500 });
  }
}
