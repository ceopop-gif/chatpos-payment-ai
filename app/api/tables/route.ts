import { getD1 } from "../../../db";

async function seedInitialTables() {
  const db = getD1();
  const count = await db.prepare("SELECT COUNT(*) AS total FROM restaurant_tables").first<{ total: number }>();
  if (Number(count?.total ?? 0) > 0) return;
  await db.batch(Array.from({ length: 8 }, (_, index) => db.prepare(
    "INSERT INTO restaurant_tables (name, token, active) VALUES (?, ?, 1)"
  ).bind(
    `โต๊ะ ${index + 1}`,
    crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
  )));
}

export async function GET() {
  try {
    await seedInitialTables();
    const result = await getD1().prepare(`
      SELECT t.id, t.name, t.token, t.active, t.created_at,
        COALESCE(SUM(CASE WHEN o.status = 'new' THEN o.total_cents ELSE 0 END), 0) AS order_total_cents,
        COALESCE(SUM(CASE WHEN o.status = 'new' THEN 1 ELSE 0 END), 0) AS order_count,
        MAX(CASE WHEN o.status = 'new' THEN o.created_at ELSE NULL END) AS latest_order_at
      FROM restaurant_tables t
      LEFT JOIN table_orders o ON o.table_id = t.id
      WHERE t.active = 1
      GROUP BY t.id
      ORDER BY
        CASE WHEN latest_order_at IS NULL THEN 1 ELSE 0 END ASC,
        latest_order_at DESC,
        t.id ASC
    `).all();

    return Response.json({ tables: result.results.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      token: String(row.token),
      active: Boolean(row.active),
      orderTotal: Number(row.order_total_cents) / 100,
      orderCount: Number(row.order_count),
      latestOrderAt: row.latest_order_at ? String(row.latest_order_at) : null,
      createdAt: String(row.created_at),
    })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดรายการโต๊ะไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { name?: string };
    const name = String(payload.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (!name) return Response.json({ error: "กรุณากรอกชื่อหรือหมายเลขโต๊ะ" }, { status: 400 });

    const db = getD1();
    const duplicate = await db.prepare("SELECT id FROM restaurant_tables WHERE active = 1 AND name = ? LIMIT 1").bind(name).first();
    if (duplicate) return Response.json({ error: "มีชื่อโต๊ะนี้แล้ว" }, { status: 409 });

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const table = await db.prepare(
      "INSERT INTO restaurant_tables (name, token, active) VALUES (?, ?, 1) RETURNING id, name, token, active, created_at"
    ).bind(name, token).first();
    return Response.json({ table }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เพิ่มโต๊ะไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as { id?: number; name?: string };
    const id = Number(payload.id);
    const name = String(payload.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);

    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "ไม่พบโต๊ะที่ต้องการแก้ไข" }, { status: 400 });
    if (!name) return Response.json({ error: "กรุณากรอกชื่อหรือหมายเลขโต๊ะ" }, { status: 400 });

    const db = getD1();
    const current = await db.prepare("SELECT id FROM restaurant_tables WHERE id = ? AND active = 1 LIMIT 1").bind(id).first();
    if (!current) return Response.json({ error: "ไม่พบโต๊ะนี้ในระบบ" }, { status: 404 });

    const duplicate = await db.prepare("SELECT id FROM restaurant_tables WHERE active = 1 AND name = ? AND id <> ? LIMIT 1").bind(name, id).first();
    if (duplicate) return Response.json({ error: "มีชื่อโต๊ะนี้แล้ว" }, { status: 409 });

    const table = await db.prepare(
      "UPDATE restaurant_tables SET name = ? WHERE id = ? RETURNING id, name, token, active, created_at"
    ).bind(name, id).first();

    return Response.json({ table });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "แก้ไขชื่อโต๊ะไม่สำเร็จ" }, { status: 500 });
  }
}
