import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    if (!(await getAdminSession(request))) return adminUnauthorized();
    const db = getD1();
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (id) {
      const record = await db.prepare("SELECT * FROM merchant_signed_contracts WHERE id = ?").bind(id).first();
      return Response.json(record ? { record } : { error: "ไม่พบสัญญา" }, { status: record ? 200 : 404, headers });
    }
    const q = (params.get("q") ?? "").trim().slice(0, 100);
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    if ([from, to].some(value => value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) || (from && to && from > to)) {
      return Response.json({ error: "กรุณาระบุช่วงวันที่ให้ถูกต้อง" }, { status: 400, headers });
    }
    const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
    const where = `WHERE (instr(shop_name, ?) > 0 OR instr(signer_name, ?) > 0 OR instr(phone, ?) > 0)
      AND (? = '' OR date(signed_at, '+7 hours') >= ?)
      AND (? = '' OR date(signed_at, '+7 hours') <= ?)`;
    const values = [q, q, q, from, from, to, to];
    const total = await db.prepare(`SELECT count(*) AS count FROM merchant_signed_contracts ${where}`).bind(...values).first<{ count: number }>();
    const records = await db.prepare(`SELECT id, shop_name, signer_name, phone, contract_version, signed_at FROM merchant_signed_contracts ${where} ORDER BY signed_at DESC, id DESC LIMIT 50 OFFSET ?`).bind(...values, (Math.floor(page) - 1) * 50).all();
    return Response.json({ records: records.results, total: total?.count ?? 0 }, { headers });
  } catch (error) {
    console.error("Signed contract report unavailable", error);
    return Response.json({ error: "โหลดรายงานไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อและฐานข้อมูลสัญญา" }, { status: 503, headers });
  }
}
