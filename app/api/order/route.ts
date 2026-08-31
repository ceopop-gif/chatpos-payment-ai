import { getD1 } from "../../../db";
import { defaultMenuCategories, defaultMenuProducts } from "../../../lib/menu-defaults";

type OrderItemPayload = { productId?: number; quantity?: number };

async function getPublicMenu() {
  const db = getD1();
  const [productResult, categoryResult] = await Promise.all([
    db.prepare("SELECT id, name, price_cents, category, description, image_key FROM menu_products WHERE active = 1 ORDER BY id").all(),
    db.prepare("SELECT name FROM menu_categories ORDER BY position, id").all(),
  ]);
  if (!productResult.results.length) return { products: defaultMenuProducts, categories: defaultMenuCategories };
  return {
    products: productResult.results.map((row) => ({
      id: Number(row.id), name: String(row.name), price: Number(row.price_cents) / 100,
      category: String(row.category), description: String(row.description ?? ""),
      image: row.image_key ? `/api/product-image/${row.id}` : null, active: true,
    })),
    categories: categoryResult.results.map((row) => String(row.name)),
  };
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!/^[a-f0-9]{64}$/i.test(token)) return Response.json({ error: "ลิงก์โต๊ะไม่ถูกต้อง" }, { status: 400 });
    const table = await getD1().prepare("SELECT id, name FROM restaurant_tables WHERE token = ? AND active = 1 LIMIT 1").bind(token).first();
    if (!table) return Response.json({ error: "ไม่พบโต๊ะ หรือลิงก์นี้ถูกปิดแล้ว" }, { status: 404 });
    return Response.json({ table: { id: Number(table.id), name: String(table.name) }, merchant: "ร้านตัวอย่าง", ...(await getPublicMenu()) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เปิดเมนูไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { token?: string; clientRequestId?: string; items?: OrderItemPayload[]; note?: string };
    const token = String(payload.token ?? "");
    const clientRequestId = String(payload.clientRequestId ?? "");
    const requestedItems = Array.isArray(payload.items) ? payload.items.slice(0, 50) : [];
    if (!/^[a-f0-9]{64}$/i.test(token) || !clientRequestId || !requestedItems.length) {
      return Response.json({ error: "กรุณาเลือกรายการอาหาร" }, { status: 400 });
    }

    const db = getD1();
    const existing = await db.prepare("SELECT id, order_number FROM table_orders WHERE client_request_id = ? LIMIT 1").bind(clientRequestId).first();
    if (existing) return Response.json({ order: { id: String(existing.id), orderNumber: String(existing.order_number) } });

    const table = await db.prepare("SELECT id, name FROM restaurant_tables WHERE token = ? AND active = 1 LIMIT 1").bind(token).first();
    if (!table) return Response.json({ error: "ไม่พบโต๊ะ หรือลิงก์นี้ถูกปิดแล้ว" }, { status: 404 });

    const menu = await getPublicMenu();
    const menuMap = new Map(menu.products.map((product) => [Number(product.id), product]));
    const normalizedItems = requestedItems.flatMap((item) => {
      const product = menuMap.get(Number(item.productId));
      const quantity = Math.max(1, Math.min(99, Math.floor(Number(item.quantity))));
      return product && Number.isFinite(quantity) ? [{ product, quantity }] : [];
    });
    if (!normalizedItems.length) return Response.json({ error: "ไม่พบสินค้าที่เลือก" }, { status: 400 });

    const orderId = crypto.randomUUID();
    const orderNumber = `T${Number(table.id)}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const totalCents = normalizedItems.reduce((sum, item) => sum + Math.round(Number(item.product.price) * 100) * item.quantity, 0);
    const statements = [
      db.prepare("INSERT INTO table_orders (id, order_number, table_id, client_request_id, status, total_cents, note) VALUES (?, ?, ?, ?, 'new', ?, ?)")
        .bind(orderId, orderNumber, Number(table.id), clientRequestId, totalCents, String(payload.note ?? "").trim().slice(0, 300)),
      ...normalizedItems.map((item) => db.prepare(
        "INSERT INTO table_order_items (id, order_id, product_id, product_name, price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), orderId, Number(item.product.id), String(item.product.name), Math.round(Number(item.product.price) * 100), item.quantity)),
    ];
    await db.batch(statements);

    return Response.json({ order: { id: orderId, orderNumber, tableName: String(table.name), total: totalCents / 100 } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ส่งออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }
}
