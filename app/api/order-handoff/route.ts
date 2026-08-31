import { getD1 } from "../../../db";

const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readOrder(id: string) {
  const db = getD1();
  const row = await db.prepare(`
    SELECT o.id, o.order_number, o.status, o.total_cents, o.note, o.created_at, o.updated_at,
      t.id AS table_id, t.name AS table_name
    FROM table_orders o
    JOIN restaurant_tables t ON t.id = o.table_id
    WHERE o.id = ?
    LIMIT 1
  `).bind(id).first();
  if (!row) return null;

  const itemRows = (await db.prepare(`
    SELECT product_id, product_name, price_cents, quantity
    FROM table_order_items
    WHERE order_id = ?
    ORDER BY rowid
  `).bind(id).all()).results;

  return {
    id: String(row.id),
    orderNumber: String(row.order_number),
    status: String(row.status),
    total: Number(row.total_cents) / 100,
    note: String(row.note ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    tableId: Number(row.table_id),
    tableName: String(row.table_name),
    merchant: "ร้านตัวอย่าง",
    items: itemRows.map((item: Record<string, unknown>) => ({
      productId: Number(item.product_id),
      name: String(item.product_name),
      price: Number(item.price_cents) / 100,
      quantity: Number(item.quantity),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!orderIdPattern.test(id)) return Response.json({ error: "ลิงก์ใบสั่งไม่ถูกต้อง" }, { status: 400 });
    const order = await readOrder(id);
    if (!order) return Response.json({ error: "ไม่พบใบสั่งอาหารนี้" }, { status: 404 });
    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เปิดใบสั่งไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as { id?: string; action?: string };
    const id = String(payload.id ?? "");
    const action = String(payload.action ?? "");
    if (!orderIdPattern.test(id) || !["accept", "pickup"].includes(action)) {
      return Response.json({ error: "ข้อมูลใบสั่งไม่ถูกต้อง" }, { status: 400 });
    }

    const current = await readOrder(id);
    if (!current) return Response.json({ error: "ไม่พบใบสั่งอาหารนี้" }, { status: 404 });

    if (action === "pickup" && current.status === "new") {
      return Response.json({ error: "กรุณากดรับเรื่องก่อนรับอาหารจากครัว" }, { status: 409 });
    }

    const nextStatus = action === "accept" ? "accepted" : "kitchen_received";
    const canUpdate = action === "accept" ? current.status === "new" : current.status === "accepted";
    if (canUpdate) {
      await getD1().prepare(
        "UPDATE table_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(nextStatus, id).run();
    }

    return Response.json({ order: await readOrder(id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อัปเดตใบสั่งไม่สำเร็จ" }, { status: 500 });
  }
}
