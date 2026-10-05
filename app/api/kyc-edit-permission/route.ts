import { getD1 } from "../../../db";
import { getMerchantSession, unauthorizedResponse } from "../../../lib/merchant-auth";

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

async function ensureKycEditTable() {
  const db = getD1();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS kyc_edit_permissions (
      merchant_id TEXT PRIMARY KEY NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 0,
      allowed_by TEXT,
      allowed_at TEXT,
      revoked_at TEXT,
      consumed_at TEXT,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES merchant_applications(id) ON DELETE CASCADE
    )
  `).run();
}

export async function GET(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();
    await ensureKycEditTable();

    const row = await getD1().prepare(`
      SELECT
        a.id, a.application_number, a.phone, a.first_name, a.last_name,
        a.address, a.latitude, a.longitude, a.map_url, a.business_description,
        a.kyc_status, a.status, a.approved_at,
        COALESCE(p.allowed, 0) AS edit_allowed, p.allowed_by, p.allowed_at,
        p.revoked_at, p.consumed_at, COALESCE(p.note, '') AS permission_note
      FROM merchant_applications a
      LEFT JOIN kyc_edit_permissions p ON p.merchant_id = a.id
      WHERE a.id = ?
      LIMIT 1
    `).bind(session.applicationId).first();

    if (!row) return Response.json({ error: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });

    return Response.json({
      merchant: {
        id: String(row.id),
        applicationNumber: String(row.application_number ?? ""),
        phone: String(row.phone ?? ""),
        name: `${String(row.first_name ?? "")} ${String(row.last_name ?? "")}`.trim(),
        address: String(row.address ?? ""),
        latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
        longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
        mapUrl: String(row.map_url ?? ""),
        businessDescription: String(row.business_description ?? ""),
        kycStatus: String(row.kyc_status ?? ""),
        accountStatus: String(row.status ?? ""),
        approvedAt: row.approved_at ? String(row.approved_at) : null,
      },
      permission: {
        editAllowed: Number(row.edit_allowed ?? 0) === 1,
        allowedBy: row.allowed_by ? String(row.allowed_by) : null,
        allowedAt: row.allowed_at ? String(row.allowed_at) : null,
        revokedAt: row.revoked_at ? String(row.revoked_at) : null,
        consumedAt: row.consumed_at ? String(row.consumed_at) : null,
        note: String(row.permission_note ?? ""),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "ตรวจสิทธิ์แก้ไข KYC ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();
    await ensureKycEditTable();

    const payload = (await request.json()) as { action?: string; note?: string };
    const action = cleanText(payload.action, 30);
    const note = cleanText(payload.note, 1000);
    if (action !== "resubmit") {
      return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
    }

    const db = getD1();
    const permission = await db.prepare(
      "SELECT allowed FROM kyc_edit_permissions WHERE merchant_id = ? LIMIT 1"
    ).bind(session.applicationId).first();
    if (Number(permission?.allowed ?? 0) !== 1) {
      return Response.json(
        { error: "ร้านนี้ยังไม่ได้รับอนุญาตจากหลังบ้านให้แก้ไขหรือส่ง KYC ใหม่" },
        { status: 403 },
      );
    }

    const merchant = await db.prepare(
      "SELECT kyc_status FROM merchant_applications WHERE id = ? LIMIT 1"
    ).bind(session.applicationId).first();
    if (!merchant) return Response.json({ error: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });
    const previousStatus = String(merchant.kyc_status ?? "pending");

    await db.batch([
      db.prepare(`
        UPDATE merchant_applications
        SET kyc_status = 'pending',
            kyc_note = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note || "ร้านส่ง KYC ใหม่หลังได้รับอนุญาตจากหลังบ้าน", session.applicationId),
      db.prepare(`
        UPDATE kyc_edit_permissions
        SET allowed = 0,
            consumed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE merchant_id = ?
      `).bind(session.applicationId),
      db.prepare(`
        INSERT INTO kyc_reviews
          (id, application_id, action, previous_status, next_status, agent_id, note, reviewed_by)
        VALUES (?, ?, 'merchant_kyc_resubmit', ?, 'pending', NULL, ?, ?)
      `).bind(
        crypto.randomUUID(),
        session.applicationId,
        previousStatus,
        note || "ร้านส่ง KYC ใหม่หลังได้รับอนุญาตจากหลังบ้าน",
        session.username,
      ),
    ]);

    return Response.json({
      submitted: true,
      kycStatus: "pending",
      editAllowed: false,
      paymentStatusChanged: false,
      message: "ส่ง KYC ใหม่แล้ว ระบบปิดสิทธิ์แก้ไขอัตโนมัติและรอหลังบ้านตรวจอีกครั้ง",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "ส่ง KYC ใหม่ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
