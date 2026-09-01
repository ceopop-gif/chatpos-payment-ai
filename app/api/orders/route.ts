import { getD1 } from "../../../db";
import { getMerchantSession, unauthorizedResponse } from "../../../lib/merchant-auth";

export async function GET(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();
    const db = getD1();
    const orderResult = await db.prepare(`
      SELECT o.id, o.order_number, o.status, o.total_cents, o.note, o.created_at, o.updated_at,
        t.id AS table_id, t.name AS table_name
      FROM table_orders o
      JOIN restaurant_tables t ON t.id = o.table_id
      WHERE t.merchant_id = ?
      ORDER BY o.created_at DESC
      LIMIT 100
    `).bind(session.applicationId).all();
    const orderIds = orderResult.results.map((row) => String(row.id));
    const itemRows = orderIds.length
      ? (await db.prepare(`SELECT order_id, product_id, product_name, price_cents, quantity FROM table_order_items WHERE order_id IN (${orderIds.map(() => "?").join(",")}) ORDER BY rowid`).bind(...orderIds).all()).results
      : [];

    return Response.json({ orders: orderResult.results.map((row) => ({
      id: String(row.id),
      orderNumber: String(row.order_number),
      status: String(row.status),
      total: Number(row.total_cents) / 100,
      note: String(row.note ?? ""),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      tableId: Number(row.table_id),
      tableName: String(row.table_name),
      items: itemRows.filter((item) => String(item.order_id) === String(row.id)).map((item) => ({
        productId: Number(item.product_id),
        name: String(item.product_name),
        price: Number(item.price_cents) / 100,
        quantity: Number(item.quantity),
      })),
    })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();
    const payload = (await request.json()) as { id?: string; status?: string };
    const id = String(payload.id ?? "");
    const status = String(payload.status ?? "");
    if (!id || !["new", "accepted", "kitchen_received", "done"].includes(status)) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    const result = await getD1().prepare(
      "UPDATE table_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND table_id IN (SELECT id FROM restaurant_tables WHERE merchant_id = ?) RETURNING id, status"
    ).bind(status, id, session.applicationId).first();
    if (!result) return Response.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
    return Response.json({ order: result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อัปเดตออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }
}
