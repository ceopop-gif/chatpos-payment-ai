import { getBucket, getD1 } from "../../../db";
import { defaultMenuCategories, defaultMenuProducts } from "../../../lib/menu-defaults";
import { getMerchantSession, unauthorizedResponse } from "../../../lib/merchant-auth";

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

export async function GET(request: Request) {
  try {
    if (!(await getMerchantSession(request))) return unauthorizedResponse();
    const db = getD1();
    const [productResult, categoryResult] = await Promise.all([
      db.prepare("SELECT id, name, price_cents, category, description, image_key, active FROM menu_products ORDER BY id").all(),
      db.prepare("SELECT name FROM menu_categories ORDER BY position, id").all(),
    ]);

    if (!productResult.results.length) {
      return Response.json({ products: defaultMenuProducts, categories: defaultMenuCategories, persisted: false });
    }

    return Response.json({
      products: productResult.results.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        price: Number(row.price_cents) / 100,
        category: String(row.category),
        description: String(row.description ?? ""),
        image: row.image_key ? `/api/product-image/${row.id}` : null,
        active: Boolean(row.active),
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
    if (!(await getMerchantSession(request))) return unauthorizedResponse();
    const payload = (await request.json()) as { products?: MenuProductPayload[]; categories?: string[] };
    const products = Array.isArray(payload.products) ? payload.products.slice(0, 500) : [];
    const categories = Array.isArray(payload.categories)
      ? payload.categories.map((value) => String(value).trim()).filter(Boolean).slice(0, 100)
      : [];

    const db = getD1();
    const bucket = getBucket();
    const existingResult = await db.prepare("SELECT id, image_key FROM menu_products").all();
    const existingImages = new Map(existingResult.results.map((row) => [Number(row.id), row.image_key ? String(row.image_key) : null]));
    const normalizedProducts: Array<{ id: number; name: string; priceCents: number; category: string; description: string; imageKey: string | null; active: number }> = [];

    for (const candidate of products) {
      const id = Number(candidate.id);
      const name = String(candidate.name ?? "").trim();
      const category = String(candidate.category ?? "").trim();
      const price = Number(candidate.price);
      if (!Number.isSafeInteger(id) || id <= 0 || !name || !category || !Number.isFinite(price) || price <= 0) continue;

      let imageKey = existingImages.get(id) ?? null;
      if (typeof candidate.image === "string" && candidate.image.startsWith("data:")) {
        const decoded = decodeDataImage(candidate.image);
        if (decoded) {
          imageKey = `menu-products/${id}`;
          await bucket.put(imageKey, decoded.bytes, { httpMetadata: { contentType: decoded.contentType, cacheControl: "public, max-age=86400" } });
        }
      } else if (!candidate.image) {
        if (imageKey) await bucket.delete(imageKey);
        imageKey = null;
      }

      normalizedProducts.push({
        id,
        name: name.slice(0, 80),
        priceCents: Math.round(price * 100),
        category: category.slice(0, 60),
        description: String(candidate.description ?? "").trim().slice(0, 180),
        imageKey,
        active: candidate.active === false ? 0 : 1,
      });
    }

    const statements = [
      db.prepare("DELETE FROM menu_categories"),
      db.prepare("DELETE FROM menu_products"),
      ...categories.map((name, position) => db.prepare("INSERT INTO menu_categories (name, position) VALUES (?, ?)").bind(name.slice(0, 60), position)),
      ...normalizedProducts.map((product) => db.prepare(
        "INSERT INTO menu_products (id, name, price_cents, category, description, image_key, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
      ).bind(product.id, product.name, product.priceCents, product.category, product.description, product.imageKey, product.active)),
    ];
    await db.batch(statements);

    return Response.json({ saved: normalizedProducts.length, categories: categories.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึกเมนูไม่สำเร็จ" }, { status: 500 });
  }
}
