import { getBucket, getD1 } from "../../../db";
import { defaultMenuCategories, defaultMenuProducts } from "../../../lib/menu-defaults";
import { getMerchantSession, unauthorizedResponse } from "../../../lib/merchant-auth";
import { scanProductRisk } from "../../../lib/product-moderation";

type MenuProductPayload = {
  id?: number;
  name?: string;
  price?: number;
  category?: string;
  description?: string;
  image?: string | null;
  active?: boolean;
};

function decodeDataImage(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  if (binary.length > 2_500_000) throw new Error("รูปสินค้ามีขนาดใหญ่เกินไป");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, contentType: match[1] };
}

function productImageUrl(localProductId: number, merchantId: string) {
  return `/api/product-image/${localProductId}?merchant=${encodeURIComponent(merchantId)}`;
}

export async function GET(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();
    const db = getD1();
    const [productResult, categoryResult] = await Promise.all([
      db.prepare(`
        SELECT local_product_id, name, price_cents, category, description, image_key, active,
          moderation_status, risk_level, risk_reason
        FROM merchant_menu_products
        WHERE merchant_id = ?
        ORDER BY updated_at DESC, local_product_id
      `).bind(session.applicationId).all(),
      db.prepare("SELECT name FROM merchant_menu_categories WHERE merchant_id = ? ORDER BY position, id")
        .bind(session.applicationId).all(),
    ]);

    if (!productResult.results.length) {
      return Response.json({ products: defaultMenuProducts, categories: defaultMenuCategories, persisted: false });
    }

    return Response.json({
      products: productResult.results.map((row) => ({
        id: Number(row.local_product_id),
        name: String(row.name),
        price: Number(row.price_cents) / 100,
        category: String(row.category),
        description: String(row.description ?? ""),
        image: row.image_key ? productImageUrl(Number(row.local_product_id), session.applicationId) : null,
        active: Boolean(row.active) && ["approved", "approved_override"].includes(String(row.moderation_status)),
        moderation: {
          status: String(row.moderation_status),
          riskLevel: String(row.risk_level),
          reason: String(row.risk_reason ?? ""),
        },
      })),
      categories: categoryResult.results.map((row) => String(row.name)),
      persisted: true,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดเมนูไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();
    const payload = (await request.json()) as { products?: MenuProductPayload[]; categories?: string[] };
    const products = Array.isArray(payload.products) ? payload.products.slice(0, 500) : [];
    const categories = Array.isArray(payload.categories)
      ? payload.categories.map((value) => String(value).trim()).filter(Boolean).slice(0, 100)
      : [];

    const db = getD1();
    const bucket = getBucket();
    const existingResult = await db.prepare(
      "SELECT id, local_product_id, image_key, name, category, description, moderation_status FROM merchant_menu_products WHERE merchant_id = ?"
    ).bind(session.applicationId).all();
    const existingProducts = new Map(existingResult.results.map((row) => [Number(row.local_product_id), {
      id: String(row.id), imageKey: row.image_key ? String(row.image_key) : null,
      name: String(row.name), category: String(row.category), description: String(row.description ?? ""),
      moderationStatus: String(row.moderation_status),
    }]));
    const normalizedProducts: Array<{
      id: string; localProductId: number; name: string; priceCents: number; category: string; description: string;
      imageKey: string | null; active: number; moderationStatus: string; riskLevel: string; riskCategory: string;
      riskReason: string; matchedTerms: string; shouldAlert: boolean;
    }> = [];

    for (const candidate of products) {
      const localProductId = Number(candidate.id);
      const name = String(candidate.name ?? "").trim();
      const category = String(candidate.category ?? "").trim();
      const price = Number(candidate.price);
      if (!Number.isSafeInteger(localProductId) || localProductId <= 0 || !name || !category || !Number.isFinite(price) || price <= 0) continue;

      const existing = existingProducts.get(localProductId);
      const id = existing?.id ?? crypto.randomUUID();
      let imageKey = existing?.imageKey ?? null;
      if (typeof candidate.image === "string" && candidate.image.startsWith("data:")) {
        const decoded = decodeDataImage(candidate.image);
        if (decoded) {
          imageKey = `menu-products/${session.applicationId}/${localProductId}`;
          await bucket.put(imageKey, decoded.bytes, { httpMetadata: { contentType: decoded.contentType, cacheControl: "public, max-age=86400" } });
        }
      } else if (!candidate.image) {
        if (imageKey) await bucket.delete(imageKey);
        imageKey = null;
      }

      const description = String(candidate.description ?? "").trim().slice(0, 180);
      const risk = scanProductRisk({ name, category, description });
      const approvedOverride = existing?.moderationStatus === "approved_override"
        && existing.name === name.slice(0, 80) && existing.category === category.slice(0, 60)
        && existing.description === description;
      const shouldAlert = risk.shouldBlock && !approvedOverride;
      normalizedProducts.push({
        id,
        localProductId,
        name: name.slice(0, 80),
        priceCents: Math.round(price * 100),
        category: category.slice(0, 60),
        description,
        imageKey,
        active: shouldAlert ? 0 : candidate.active === false ? 0 : 1,
        moderationStatus: approvedOverride ? "approved_override" : shouldAlert ? "flagged" : "approved",
        riskLevel: risk.level,
        riskCategory: risk.category,
        riskReason: risk.reason,
        matchedTerms: JSON.stringify(risk.matchedTerms),
        shouldAlert,
      });
    }

    const incomingIds = new Set(normalizedProducts.map((product) => product.localProductId));
    const removedProducts = [...existingProducts.entries()].filter(([localProductId]) => !incomingIds.has(localProductId));
    for (const [, product] of removedProducts) {
      if (product.imageKey) await bucket.delete(product.imageKey);
    }

    const statements = [
      db.prepare("DELETE FROM merchant_menu_categories WHERE merchant_id = ?").bind(session.applicationId),
      ...categories.map((name, position) => db.prepare(
        "INSERT INTO merchant_menu_categories (merchant_id, name, position) VALUES (?, ?, ?)"
      ).bind(session.applicationId, name.slice(0, 60), position)),
      ...removedProducts.map(([, product]) => db.prepare("DELETE FROM merchant_menu_products WHERE id = ?").bind(product.id)),
    ];

    for (const product of normalizedProducts) {
      statements.push(db.prepare(`
        INSERT INTO merchant_menu_products (
          id, merchant_id, local_product_id, name, price_cents, category, description, image_key, active,
          moderation_status, risk_level, risk_category, risk_reason, matched_terms, scanned_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(merchant_id, local_product_id) DO UPDATE SET
          name = excluded.name, price_cents = excluded.price_cents, category = excluded.category,
          description = excluded.description, image_key = excluded.image_key, active = excluded.active,
          moderation_status = excluded.moderation_status, risk_level = excluded.risk_level,
          risk_category = excluded.risk_category, risk_reason = excluded.risk_reason,
          matched_terms = excluded.matched_terms, scanned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      `).bind(
        product.id, session.applicationId, product.localProductId, product.name, product.priceCents,
        product.category, product.description, product.imageKey, product.active, product.moderationStatus,
        product.riskLevel, product.riskCategory, product.riskReason, product.matchedTerms,
      ));
      if (product.shouldAlert) {
        statements.push(db.prepare(`
          INSERT INTO product_moderation_alerts (
            id, merchant_id, product_id, severity, category, reason, matched_terms, status
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, 'open'
          WHERE NOT EXISTS (
            SELECT 1 FROM product_moderation_alerts WHERE product_id = ? AND status IN ('open', 'acknowledged')
          )
        `).bind(
          crypto.randomUUID(), session.applicationId, product.id, product.riskLevel, product.riskCategory,
          product.riskReason, product.matchedTerms, product.id,
        ));
      } else {
        statements.push(db.prepare(`
          UPDATE product_moderation_alerts
          SET status = 'resolved', reviewed_by = 'AI policy scanner',
            review_note = 'ร้านแก้ไขข้อมูลและผ่านการตรวจอัตโนมัติ', reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE product_id = ? AND status IN ('open', 'acknowledged')
        `).bind(product.id));
      }
    }
    await db.batch(statements);

    const flaggedProducts = normalizedProducts.filter((product) => product.shouldAlert);
    return Response.json({
      saved: normalizedProducts.length,
      categories: categories.length,
      moderation: {
        flagged: flaggedProducts.length,
        blockedProductIds: flaggedProducts.map((product) => product.localProductId),
        message: flaggedProducts.length
          ? "พบสินค้าที่ต้องตรวจสอบ ระบบพักการแสดงสินค้าและแจ้งผู้ดูแลแล้ว"
          : "AI ตรวจสอบรายการสินค้าแล้ว ไม่พบข้อความต้องห้าม",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึกเมนูไม่สำเร็จ" }, { status: 500 });
  }
}
