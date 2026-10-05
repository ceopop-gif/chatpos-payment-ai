import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";

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
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS kyc_edit_permissions_allowed_idx ON kyc_edit_permissions(allowed, updated_at)"
  ).run();
}

function mapMerchant(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    applicationNumber: String(row.application_number ?? ""),
    phone: String(row.phone ?? ""),
    name: `${String(row.first_name ?? "")} ${String(row.last_name ?? "")}`.trim(),
    address: String(row.address ?? ""),
    businessDescription: String(row.business_description ?? ""),
    kycStatus: String(row.kyc_status ?? ""),
    accountStatus: String(row.status ?? ""),
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    editAllowed: Number(row.edit_allowed ?? 0) === 1,
    allowedBy: row.allowed_by ? String(row.allowed_by) : null,
    allowedAt: row.allowed_at ? String(row.allowed_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    consumedAt: row.consumed_at ? String(row.consumed_at) : null,
    permissionNote: String(row.permission_note ?? ""),
  };
}

export async function GET(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureKycEditTable();

    const url = new URL(request.url);
    const search = cleanText(url.searchParams.get("q"), 120);
    const db = getD1();
    const like = `%${search}%`;

    const rows = search
      ? await db.prepare(`
          SELECT
            a.id, a.application_number, a.phone, a.first_name, a.last_name,
            a.address, a.business_description, a.kyc_status, a.status, a.approved_at,
            COALESCE(p.allowed, 0) AS edit_allowed, p.allowed_by, p.allowed_at,
            p.revoked_at, p.consumed_at, COALESCE(p.note, '') AS permission_note
          FROM merchant_applications a
          LEFT JOIN kyc_edit_permissions p ON p.merchant_id = a.id
          WHERE
            a.application_number LIKE ? OR
            a.phone LIKE ? OR
            a.first_name LIKE ? OR
            a.last_name LIKE ? OR
            (a.first_name || ' ' || a.last_name) LIKE ?
          ORDER BY COALESCE(p.allowed, 0) DESC, a.updated_at DESC, a.created_at DESC
          LIMIT 300
        `).bind(like, like, like, like, like).all()
      : await db.prepare(`
          SELECT
            a.id, a.application_number, a.phone, a.first_name, a.last_name,
            a.address, a.business_description, a.kyc_status, a.status, a.approved_at,
            COALESCE(p.allowed, 0) AS edit_allowed, p.allowed_by, p.allowed_at,
            p.revoked_at, p.consumed_at, COALESCE(p.note, '') AS permission_note
          FROM merchant_applications a
          LEFT JOIN kyc_edit_permissions p ON p.merchant_id = a.id
          ORDER BY COALESCE(p.allowed, 0) DESC, a.updated_at DESC, a.created_at DESC
          LIMIT 300
        `).all();

    const summary = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM merchant_applications) AS total_merchants,
        (SELECT COUNT(*) FROM kyc_edit_permissions WHERE allowed = 1) AS allowed_merchants
    `).first();

    return Response.json({
      merchants: (rows.results ?? []).map((row) => mapMerchant(row as Record<string, unknown>)),
      summary: {
        totalMerchants: Number(summary?.total_merchants ?? 0),
        allowedMerchants: Number(summary?.allowed_merchants ?? 0),
      },
      search,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "โหลดรายการร้านไม่สำเร็จ" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    await ensureKycEditTable();

    const payload = (await request.json()) as {
      merchantId?: string;
      action?: "allow" | "revoke";
      note?: string;
    };
    const merchantId = cleanText(payload.merchantId, 80);
    const action = cleanText(payload.action, 20);
    const note = cleanText(payload.note, 1000);
    if (!merchantId || !["allow", "revoke"].includes(action)) {
      return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
    }

    const db = getD1();
    const merchant = await db.prepare(
      "SELECT id, kyc_status FROM merchant_applications WHERE id = ? LIMIT 1"
    ).bind(merchantId).first();
    if (!merchant) return Response.json({ error: "ไม่พบร้านค้า" }, { status: 404 });

    const previousStatus = String(merchant.kyc_status ?? "pending");

    if (action === "allow") {
      await db.batch([
        db.prepare(`
          INSERT INTO kyc_edit_permissions
            (merchant_id, allowed, allowed_by, allowed_at, revoked_at, consumed_at, note, updated_at)
          VALUES (?, 1, ?, CURRENT_TIMESTAMP, NULL, NULL, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(merchant_id) DO UPDATE SET
            allowed = 1,
            allowed_by = excluded.allowed_by,
            allowed_at = CURRENT_TIMESTAMP,
            revoked_at = NULL,
            consumed_at = NULL,
            note = excluded.note,
            updated_at = CURRENT_TIMESTAMP
        `).bind(merchantId, admin.username, note),
        db.prepare(`
          INSERT INTO kyc_reviews
            (id, application_id, action, previous_status, next_status, agent_id, note, reviewed_by)
          VALUES (?, ?, 'allow_kyc_edit', ?, ?, NULL, ?, ?)
        `).bind(crypto.randomUUID(), merchantId, previousStatus, previousStatus, note || "อนุญาตให้ร้านแก้ไขและส่ง KYC ใหม่", admin.username),
      ]);
      return Response.json({ updated: true, editAllowed: true });
    }

    await db.batch([
      db.prepare(`
        INSERT INTO kyc_edit_permissions
          (merchant_id, allowed, allowed_by, allowed_at, revoked_at, consumed_at, note, updated_at)
        VALUES (?, 0, ?, NULL, CURRENT_TIMESTAMP, NULL, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(merchant_id) DO UPDATE SET
          allowed = 0,
          revoked_at = CURRENT_TIMESTAMP,
          note = excluded.note,
          updated_at = CURRENT_TIMESTAMP
      `).bind(merchantId, admin.username, note),
      db.prepare(`
        INSERT INTO kyc_reviews
          (id, application_id, action, previous_status, next_status, agent_id, note, reviewed_by)
        VALUES (?, ?, 'revoke_kyc_edit', ?, ?, NULL, ?, ?)
      `).bind(crypto.randomUUID(), merchantId, previousStatus, previousStatus, note || "ยกเลิกสิทธิ์แก้ไข KYC", admin.username),
    ]);
    return Response.json({ updated: true, editAllowed: false });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "อัปเดตสิทธิ์แก้ไข KYC ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
