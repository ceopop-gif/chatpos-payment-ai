import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";
import { scanProductRisk } from "../../../../lib/product-moderation";

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function parseTerms(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  try {
    if (!(await getAdminSession(request))) return adminUnauthorized();
    const db = getD1();
    const merchantId = cleanText(new URL(request.url).searchParams.get("merchant"), 80);
    const merchantFilter = merchantId ? "WHERE p.merchant_id = ?" : "";
    const productsStatement = db.prepare(`
      SELECT p.id, p.merchant_id, p.local_product_id, p.name, p.price_cents, p.category,
        p.description, p.image_key, p.active, p.moderation_status, p.risk_level,
        p.risk_category, p.risk_reason, p.matched_terms, p.scanned_at, p.updated_at,
        m.application_number, m.phone, m.first_name, m.last_name, m.business_description,
        a.code AS agent_code, a.name AS agent_name
      FROM merchant_menu_products p
      JOIN merchant_applications m ON m.id = p.merchant_id
      LEFT JOIN agents a ON a.id = m.agent_id
      ${merchantFilter}
      ORDER BY CASE p.risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        p.updated_at DESC
      LIMIT 2500
    `);
    const [summary, productResult, alertResult, merchantResult] = await Promise.all([
      db.prepare(`
        SELECT COUNT(*) AS total_products,
          SUM(CASE WHEN active = 1 AND moderation_status IN ('approved', 'approved_override') THEN 1 ELSE 0 END) AS active_products,
          SUM(CASE WHEN moderation_status = 'flagged' THEN 1 ELSE 0 END) AS flagged_products
        FROM merchant_menu_products
      `).first(),
      (merchantId ? productsStatement.bind(merchantId) : productsStatement).all(),
      db.prepare(`
        SELECT al.id, al.merchant_id, al.product_id, al.severity, al.category, al.reason,
          al.matched_terms, al.status, al.reviewed_by, al.review_note, al.reviewed_at,
          al.created_at, al.updated_at, p.name AS product_name, p.local_product_id,
          m.application_number, m.phone, m.first_name, m.last_name
        FROM product_moderation_alerts al
        JOIN merchant_menu_products p ON p.id = al.product_id
        JOIN merchant_applications m ON m.id = al.merchant_id
        ORDER BY CASE al.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
          CASE al.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
          al.created_at DESC
        LIMIT 500
      `).all(),
      db.prepare(`
        SELECT m.id, m.application_number, m.phone, m.first_name, m.last_name,
          m.business_description, m.kyc_status,
          COUNT(p.id) AS product_count,
          SUM(CASE WHEN p.moderation_status = 'flagged' THEN 1 ELSE 0 END) AS flagged_count
        FROM merchant_applications m
        LEFT JOIN merchant_menu_products p ON p.merchant_id = m.id
        GROUP BY m.id
        ORDER BY flagged_count DESC, product_count DESC, m.created_at DESC
        LIMIT 500
      `).all(),
    ]);

    const alerts = alertResult.results.map((row) => ({
      id: String(row.id), merchantId: String(row.merchant_id), productId: String(row.product_id),
      localProductId: Number(row.local_product_id), productName: String(row.product_name),
      severity: String(row.severity), category: String(row.category), reason: String(row.reason),
      matchedTerms: parseTerms(row.matched_terms), status: String(row.status),
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      reviewNote: String(row.review_note ?? ""), reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      applicationNumber: String(row.application_number), phone: String(row.phone),
      merchantName: `${String(row.first_name)} ${String(row.last_name)}`.trim(),
    }));
    const openAlerts = alerts.filter((alert) => alert.status === "open" || alert.status === "acknowledged").length;

    return Response.json({
      summary: {
        totalProducts: Number(summary?.total_products ?? 0),
        activeProducts: Number(summary?.active_products ?? 0),
        flaggedProducts: Number(summary?.flagged_products ?? 0),
        openAlerts,
      },
      merchants: merchantResult.results.map((row) => ({
        id: String(row.id), applicationNumber: String(row.application_number), phone: String(row.phone),
        name: `${String(row.first_name)} ${String(row.last_name)}`.trim(),
        businessDescription: String(row.business_description), kycStatus: String(row.kyc_status),
        productCount: Number(row.product_count), flaggedCount: Number(row.flagged_count ?? 0),
      })),
      products: productResult.results.map((row) => ({
        id: String(row.id), merchantId: String(row.merchant_id), localProductId: Number(row.local_product_id),
        name: String(row.name), price: Number(row.price_cents) / 100, category: String(row.category),
        description: String(row.description ?? ""),
        image: row.image_key ? `/api/product-image/${row.local_product_id}?merchant=${encodeURIComponent(String(row.merchant_id))}` : null,
        active: Boolean(row.active), moderationStatus: String(row.moderation_status),
        riskLevel: String(row.risk_level), riskCategory: String(row.risk_category ?? ""),
        riskReason: String(row.risk_reason ?? ""), matchedTerms: parseTerms(row.matched_terms),
        scannedAt: String(row.scanned_at), updatedAt: String(row.updated_at),
        applicationNumber: String(row.application_number), merchantPhone: String(row.phone),
        merchantName: `${String(row.first_name)} ${String(row.last_name)}`.trim(),
        businessDescription: String(row.business_description),
        agentCode: row.agent_code ? String(row.agent_code) : null,
        agentName: row.agent_name ? String(row.agent_name) : null,
      })),
      alerts,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดข้อมูลสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    const payload = (await request.json()) as { productId?: string; alertId?: string; action?: string; note?: string };
    const productId = cleanText(payload.productId, 80);
    const alertId = cleanText(payload.alertId, 80);
    const action = cleanText(payload.action, 30);
    const note = cleanText(payload.note, 500);
    if (!productId) return Response.json({ error: "ไม่พบรหัสสินค้า" }, { status: 400 });
    const db = getD1();
    const product = await db.prepare(`
      SELECT id, merchant_id, name, category, description FROM merchant_menu_products WHERE id = ? LIMIT 1
    `).bind(productId).first();
    if (!product) return Response.json({ error: "ไม่พบสินค้า" }, { status: 404 });

    if (action === "acknowledge") {
      if (!alertId) return Response.json({ error: "ไม่พบรหัสแจ้งเตือน" }, { status: 400 });
      await db.prepare(`
        UPDATE product_moderation_alerts
        SET status = 'acknowledged', reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND product_id = ?
      `).bind(admin.username, note || "แอดมินรับทราบและกำลังตรวจสอบ", alertId, productId).run();
      return Response.json({ updated: true, status: "acknowledged" });
    }

    if (action === "approve" || action === "remove") {
      const approved = action === "approve";
      await db.batch([
        db.prepare(`
          UPDATE merchant_menu_products
          SET active = ?, moderation_status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(approved ? 1 : 0, approved ? "approved_override" : "removed", productId),
        db.prepare(`
          UPDATE product_moderation_alerts
          SET status = 'resolved', reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE product_id = ? AND status IN ('open', 'acknowledged')
        `).bind(admin.username, note || (approved ? "แอดมินตรวจแล้ว อนุญาตให้ขาย" : "แอดมินตรวจแล้ว ปิดรายการสินค้า"), productId),
      ]);
      return Response.json({ updated: true, status: approved ? "approved" : "removed" });
    }

    if (action === "rescan") {
      const risk = scanProductRisk({
        name: String(product.name), category: String(product.category), description: String(product.description ?? ""),
      });
      const moderationStatus = risk.shouldBlock ? "flagged" : "approved";
      await db.prepare(`
        UPDATE merchant_menu_products
        SET active = CASE WHEN ? = 1 THEN 0 ELSE active END, moderation_status = ?, risk_level = ?,
          risk_category = ?, risk_reason = ?, matched_terms = ?, scanned_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        risk.shouldBlock ? 1 : 0, moderationStatus, risk.level, risk.category, risk.reason,
        JSON.stringify(risk.matchedTerms), productId,
      ).run();
      if (risk.shouldBlock) {
        await db.prepare(`
          INSERT INTO product_moderation_alerts (id, merchant_id, product_id, severity, category, reason, matched_terms, status)
          SELECT ?, ?, ?, ?, ?, ?, ?, 'open'
          WHERE NOT EXISTS (SELECT 1 FROM product_moderation_alerts WHERE product_id = ? AND status IN ('open', 'acknowledged'))
        `).bind(
          crypto.randomUUID(), String(product.merchant_id), productId, risk.level, risk.category,
          risk.reason, JSON.stringify(risk.matchedTerms), productId,
        ).run();
      }
      return Response.json({ updated: true, status: moderationStatus, risk });
    }

    return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อัปเดตผลตรวจสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}
