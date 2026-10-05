import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";
import { ensureChatPosHubSchema, lookupHubMerchant, normalizeThaiPhone } from "../../../../lib/chatposhub";

function moneyToCents(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return null;
  return Math.round(amount * 100);
}

export async function GET(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureChatPosHubSchema();
    const url = new URL(request.url);
    const groupId = String(url.searchParams.get("groupId") ?? "").trim();
    if (!groupId) return Response.json({ error: "ไม่พบรหัสกลุ่ม" }, { status: 400 });
    const db = getD1();
    const group = await db.prepare("SELECT id, name, status, default_daily_limit_cents, created_at FROM chatposhub_groups WHERE id = ? LIMIT 1")
      .bind(groupId).first();
    if (!group) return Response.json({ error: "ไม่พบกลุ่ม" }, { status: 404 });

    const members = await db.prepare(`
      SELECT m.id, m.merchant_id, m.phone, m.daily_limit_cents, m.added_at,
             a.first_name, a.last_name, a.business_description, a.kyc_status
      FROM chatposhub_group_members m
      JOIN merchant_applications a ON a.id = m.merchant_id
      WHERE m.group_id = ? AND m.status = 'active'
      ORDER BY m.added_at DESC
    `).bind(groupId).all();

    const audit = await db.prepare(`
      SELECT action, phone, detail, actor, created_at
      FROM chatposhub_audit_logs
      WHERE group_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `).bind(groupId).all();

    const candidates = await db.prepare(`
      WITH latest_approved AS (
        SELECT
          id, phone, first_name, last_name, business_description, kyc_status, status, created_at,
          ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at DESC) AS rn
        FROM merchant_applications
        WHERE kyc_status = 'approved' AND status = 'approved'
      )
      SELECT
        a.id,
        a.phone,
        a.first_name,
        a.last_name,
        a.business_description,
        a.kyc_status,
        CASE WHEN b.phone IS NOT NULL THEN 1 ELSE 0 END AS otp_bypass,
        m.group_id AS active_group_id,
        g.name AS active_group_name
      FROM latest_approved a
      LEFT JOIN otp_bypass_phones b
        ON b.phone = a.phone AND b.status = 'active'
      LEFT JOIN chatposhub_group_members m
        ON m.phone = a.phone AND m.status = 'active'
      LEFT JOIN chatposhub_groups g
        ON g.id = m.group_id AND g.status = 'active'
      WHERE a.rn = 1
      ORDER BY
        CASE WHEN b.phone IS NOT NULL AND m.group_id IS NULL THEN 0 ELSE 1 END,
        a.created_at DESC
      LIMIT 1000
    `).all();

    return Response.json({
      group,
      members: members.results ?? [],
      audit: audit.results ?? [],
      candidates: candidates.results ?? [],
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดข้อมูลกลุ่มไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureChatPosHubSchema();
    const payload = (await request.json()) as {
      action?: string;
      groupId?: string;
      phone?: string;
      phones?: string[];
      memberId?: string;
      dailyLimit?: number;
    };
    const action = String(payload.action ?? "").trim();
    const groupId = String(payload.groupId ?? "").trim();
    if (!groupId) return Response.json({ error: "ไม่พบรหัสกลุ่ม" }, { status: 400 });
    const db = getD1();
    const group = await db.prepare("SELECT id, name, status, default_daily_limit_cents FROM chatposhub_groups WHERE id = ? AND status = 'active' LIMIT 1")
      .bind(groupId).first();
    if (!group) return Response.json({ error: "กลุ่มนี้ไม่พร้อมใช้งาน" }, { status: 404 });

    if (action === "add_members") {
      const phones = Array.from(new Set((payload.phones ?? []).map(normalizeThaiPhone).filter((phone) => /^0\d{9}$/.test(phone)))).slice(0, 100);
      if (!phones.length) return Response.json({ error: "กรุณาเลือกร้านอย่างน้อย 1 ร้าน" }, { status: 400 });

      const verified: Array<{ phone: string; merchantId: string }> = [];
      for (const phone of phones) {
        const lookup = await lookupHubMerchant(phone, groupId);
        if (!lookup.found || !lookup.eligible || !lookup.merchant) {
          return Response.json({
            error: `${phone}: ${lookup.reason}`,
            failedPhone: phone,
            lookup,
          }, { status: 409 });
        }
        verified.push({ phone, merchantId: lookup.merchant.id });
      }

      const limitCents = Number(group.default_daily_limit_cents ?? 5000000);
      const statements = verified.flatMap((item) => {
        const memberId = crypto.randomUUID();
        return [
          db.prepare(`INSERT INTO chatposhub_group_members
            (id, group_id, merchant_id, phone, daily_limit_cents, added_by)
            VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(memberId, groupId, item.merchantId, item.phone, limitCents, admin.username),
          db.prepare(`INSERT INTO chatposhub_audit_logs
            (id, group_id, merchant_id, phone, action, detail, actor)
            VALUES (?, ?, ?, ?, 'member.added', ?, ?)`)
            .bind(crypto.randomUUID(), groupId, item.merchantId, item.phone, JSON.stringify({ limitCents, source: "bulk_select" }), admin.username),
        ];
      });

      try {
        await db.batch(statements);
      } catch {
        return Response.json({ error: "มีบางเบอร์ถูกเพิ่มเข้ากลุ่มอื่นแล้ว กรุณาค้นหาใหม่ก่อนบันทึก" }, { status: 409 });
      }

      return Response.json({ added: true, count: verified.length, phones: verified.map((item) => item.phone) });
    }

    if (action === "add_member") {
      const phone = normalizeThaiPhone(payload.phone);
      const lookup = await lookupHubMerchant(phone, groupId);
      if (!lookup.found || !lookup.eligible || !lookup.merchant) {
        return Response.json({ error: lookup.reason, lookup }, { status: 409 });
      }
      const memberId = crypto.randomUUID();
      const limitCents = Number(group.default_daily_limit_cents ?? 5000000);
      try {
        await db.batch([
          db.prepare(`INSERT INTO chatposhub_group_members
            (id, group_id, merchant_id, phone, daily_limit_cents, added_by)
            VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(memberId, groupId, lookup.merchant.id, phone, limitCents, admin.username),
          db.prepare(`INSERT INTO chatposhub_audit_logs
            (id, group_id, merchant_id, phone, action, detail, actor)
            VALUES (?, ?, ?, ?, 'member.added', ?, ?)`)
            .bind(crypto.randomUUID(), groupId, lookup.merchant.id, phone, JSON.stringify({ limitCents }), admin.username),
        ]);
      } catch {
        const existing = await db.prepare(`
          SELECT g.id, g.name
          FROM chatposhub_group_members m
          JOIN chatposhub_groups g ON g.id = m.group_id
          WHERE m.phone = ? AND m.status = 'active'
          LIMIT 1
        `).bind(phone).first();
        const name = existing?.name ? String(existing.name) : "กลุ่มอื่น";
        return Response.json({ error: `เบอร์นี้อยู่ในกลุ่ม "${name}" แล้ว กรุณานำออกจากกลุ่มเดิมก่อน` }, { status: 409 });
      }
      return Response.json({ added: true, memberId });
    }

    if (action === "remove_member") {
      const memberId = String(payload.memberId ?? "").trim();
      const member = await db.prepare("SELECT id, merchant_id, phone FROM chatposhub_group_members WHERE id = ? AND group_id = ? AND status = 'active' LIMIT 1")
        .bind(memberId, groupId).first();
      if (!member) return Response.json({ error: "ไม่พบร้านในกลุ่ม" }, { status: 404 });
      await db.batch([
        db.prepare("UPDATE chatposhub_group_members SET status = 'removed', removed_by = ?, removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(admin.username, memberId),
        db.prepare(`INSERT INTO chatposhub_audit_logs
          (id, group_id, merchant_id, phone, action, detail, actor)
          VALUES (?, ?, ?, ?, 'member.removed', '', ?)`)
          .bind(crypto.randomUUID(), groupId, String(member.merchant_id), String(member.phone), admin.username),
      ]);
      return Response.json({ removed: true });
    }

    if (action === "set_member_limit") {
      const memberId = String(payload.memberId ?? "").trim();
      const cents = moneyToCents(payload.dailyLimit);
      if (!cents) return Response.json({ error: "วงเงินต่อวันไม่ถูกต้อง" }, { status: 400 });
      const member = await db.prepare("SELECT merchant_id, phone FROM chatposhub_group_members WHERE id = ? AND group_id = ? AND status = 'active' LIMIT 1")
        .bind(memberId, groupId).first();
      if (!member) return Response.json({ error: "ไม่พบร้านในกลุ่ม" }, { status: 404 });
      await db.batch([
        db.prepare("UPDATE chatposhub_group_members SET daily_limit_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(cents, memberId),
        db.prepare(`INSERT INTO chatposhub_audit_logs
          (id, group_id, merchant_id, phone, action, detail, actor)
          VALUES (?, ?, ?, ?, 'member.limit_changed', ?, ?)`)
          .bind(crypto.randomUUID(), groupId, String(member.merchant_id), String(member.phone), JSON.stringify({ dailyLimitCents: cents }), admin.username),
      ]);
      return Response.json({ updated: true });
    }

    if (action === "set_group_limit") {
      const cents = moneyToCents(payload.dailyLimit);
      if (!cents) return Response.json({ error: "วงเงินต่อวันไม่ถูกต้อง" }, { status: 400 });
      await db.batch([
        db.prepare("UPDATE chatposhub_groups SET default_daily_limit_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(cents, groupId),
        db.prepare("UPDATE chatposhub_group_members SET daily_limit_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND status = 'active'")
          .bind(cents, groupId),
        db.prepare("INSERT INTO chatposhub_audit_logs (id, group_id, action, detail, actor) VALUES (?, ?, 'group.limit_changed', ?, ?)")
          .bind(crypto.randomUUID(), groupId, JSON.stringify({ dailyLimitCents: cents }), admin.username),
      ]);
      return Response.json({ updated: true });
    }

    return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึกข้อมูลกลุ่มไม่สำเร็จ" }, { status: 500 });
  }
}
