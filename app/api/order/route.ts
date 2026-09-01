import { getD1 } from "../../../db";
import { defaultMenuCategories, defaultMenuProducts } from "../../../lib/menu-defaults";

type OrderItemPayload = { productId?: number; quantity?: number };

async function getSessionOrderSummary(tableId: number, sessionId: string) {
  const db = getD1();
  const [orderTotals, itemResult, orderDetailResult] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) AS order_count,
        COALESCE(SUM(total_cents), 0) AS total_cents
      FROM table_orders
      WHERE table_id = ? AND session_id = ?
    `).bind(tableId, sessionId).first(),
    db.prepare(`
      SELECT i.product_id, i.product_name, i.price_cents,
        SUM(i.quantity) AS quantity,
        SUM(i.price_cents * i.quantity) AS subtotal_cents,
        MIN(o.created_at) AS first_ordered_at,
        MIN(i.rowid) AS first_rowid
      FROM table_orders o
      JOIN table_order_items i ON i.order_id = o.id
      WHERE o.table_id = ? AND o.session_id = ?
      GROUP BY i.product_id, i.product_name, i.price_cents
      ORDER BY first_ordered_at, first_rowid
    `).bind(tableId, sessionId).all(),
    db.prepare(`
      SELECT o.id AS order_id, o.order_number, o.total_cents, o.note, o.created_at,
        i.product_id, i.product_name, i.price_cents, i.quantity
      FROM table_orders o
      JOIN table_order_items i ON i.order_id = o.id
      WHERE o.table_id = ? AND o.session_id = ?
      ORDER BY o.created_at, i.rowid
    `).bind(tableId, sessionId).all(),
  ]);

  const items = itemResult.results.map((row) => ({
    productId: row.product_id == null ? null : Number(row.product_id),
    name: String(row.product_name),
    price: Number(row.price_cents) / 100,
    quantity: Number(row.quantity),
    subtotal: Number(row.subtotal_cents) / 100,
  }));
  const orders: Array<{
    id: string;
    orderNumber: string;
    total: number;
    note: string;
    createdAt: string;
    items: Array<{ productId: number | null; name: string; price: number; quantity: number; subtotal: number }>;
  }> = [];
  const orderMap = new Map<string, (typeof orders)[number]>();
  for (const row of orderDetailResult.results) {
    const orderId = String(row.order_id);
    let order = orderMap.get(orderId);
    if (!order) {
      order = {
        id: orderId,
        orderNumber: String(row.order_number),
        total: Number(row.total_cents) / 100,
        note: String(row.note ?? ""),
        createdAt: String(row.created_at),
        items: [],
      };
      orderMap.set(orderId, order);
      orders.push(order);
    }
    order.items.push({
      productId: row.product_id == null ? null : Number(row.product_id),
      name: String(row.product_name),
      price: Number(row.price_cents) / 100,
      quantity: Number(row.quantity),
      subtotal: Number(row.price_cents) * Number(row.quantity) / 100,
    });
  }

  return {
    orderCount: Number(orderTotals?.order_count ?? 0),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    total: Number(orderTotals?.total_cents ?? 0) / 100,
    items,
    orders,
  };
}

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
    const searchParams = new URL(request.url).searchParams;
    const token = searchParams.get("token") ?? "";
    const sessionId = searchParams.get("sessionId") ?? "";
    if (!/^[a-f0-9]{64}$/i.test(token)) return Response.json({ error: "ลิงก์โต๊ะไม่ถูกต้อง" }, { status: 400 });
    const table = await getD1().prepare("SELECT id, name FROM restaurant_tables WHERE token = ? AND active = 1 LIMIT 1").bind(token).first();
    if (!table) return Response.json({ error: "ไม่พบโต๊ะ หรือลิงก์นี้ถูกปิดแล้ว" }, { status: 404 });
    const summary = /^[a-zA-Z0-9-]{8,80}$/.test(sessionId)
      ? await getSessionOrderSummary(Number(table.id), sessionId)
      : undefined;
    return Response.json({ table: { id: Number(table.id), name: String(table.name) }, merchant: "ร้านตัวอย่าง", summary, ...(await getPublicMenu()) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เปิดเมนูไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { token?: string; clientRequestId?: string; sessionId?: string; items?: OrderItemPayload[]; note?: string };
    const token = String(payload.token ?? "");
    const clientRequestId = String(payload.clientRequestId ?? "");
    const requestedSessionId = String(payload.sessionId ?? "");
    const sessionId = /^[a-zA-Z0-9-]{8,80}$/.test(requestedSessionId) ? requestedSessionId : clientRequestId;
    const requestedItems = Array.isArray(payload.items) ? payload.items.slice(0, 50) : [];
    if (!/^[a-f0-9]{64}$/i.test(token) || !clientRequestId || !requestedItems.length) {
      return Response.json({ error: "กรุณาเลือกรายการอาหาร" }, { status: 400 });
    }

    const db = getD1();
    const existing = await db.prepare(`
      SELECT o.id, o.order_number, o.table_id, o.session_id, o.total_cents, t.name AS table_name
      FROM table_orders o
      JOIN restaurant_tables t ON t.id = o.table_id
      WHERE o.client_request_id = ?
      LIMIT 1
    `).bind(clientRequestId).first();
    if (existing) {
      const effectiveSessionId = String(existing.session_id ?? sessionId);
      return Response.json({
        order: {
          id: String(existing.id), orderNumber: String(existing.order_number),
          tableName: String(existing.table_name), total: Number(existing.total_cents) / 100,
        },
        summary: await getSessionOrderSummary(Number(existing.table_id), effectiveSessionId),
      });
    }

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
      db.prepare("INSERT INTO table_orders (id, order_number, table_id, client_request_id, session_id, status, total_cents, note) VALUES (?, ?, ?, ?, ?, 'new', ?, ?)")
        .bind(orderId, orderNumber, Number(table.id), clientRequestId, sessionId, totalCents, String(payload.note ?? "").trim().slice(0, 300)),
      ...normalizedItems.map((item) => db.prepare(
        "INSERT INTO table_order_items (id, order_id, product_id, product_name, price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), orderId, Number(item.product.id), String(item.product.name), Math.round(Number(item.product.price) * 100), item.quantity)),
    ];
    await db.batch(statements);

    return Response.json({
      order: { id: orderId, orderNumber, tableName: String(table.name), total: totalCents / 100 },
      summary: await getSessionOrderSummary(Number(table.id), sessionId),
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ส่งออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }
}
