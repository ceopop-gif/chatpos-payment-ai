import { getD1 } from "../../../../../db";
import { ensureStopPaySchema, normalizeThaiMobile, promoteExpiredCasesForMerchant } from "../../../../../lib/stoppay";

export async function POST(request: Request) {
  try {
    await ensureStopPaySchema();
    const input = await request.json() as { caseNumber?: string; phone?: string };
    const caseNumber = String(input.caseNumber ?? "").trim().toUpperCase();
    const phone = normalizeThaiMobile(input.phone);
    if (!caseNumber || !/^0\d{9}$/.test(phone)) {
      return Response.json({ error: "กรุณากรอกเลขเคสและเบอร์มือถือให้ถูกต้อง" }, { status: 400 });
    }

    const db = getD1();
    const row = await db.prepare(`
      SELECT c.*, cfg.merchant_name
      FROM stoppay_cases c
      JOIN chatpos_merchant_configs cfg ON cfg.merchant_id = c.merchant_id
      WHERE c.case_number = ? AND c.reporter_phone = ?
      LIMIT 1
    `).bind(caseNumber, phone).first();
    if (!row) return Response.json({ error: "ไม่พบเคสหรือเบอร์มือถือไม่ตรงกับผู้แจ้ง" }, { status: 404 });

    await promoteExpiredCasesForMerchant(String(row.merchant_id));
    const fresh = await db.prepare("SELECT * FROM stoppay_cases WHERE id = ? LIMIT 1").bind(row.id).first();
    if (!fresh) return Response.json({ error: "ไม่พบเคส" }, { status: 404 });

    if (fresh.merchant_contacted_at) {
      return Response.json({
        status: String(fresh.status),
        contacted: true,
        message: "ร้านได้บันทึกว่าติดต่อผู้แจ้งแล้ว หากยังมีข้อพิพาทกรุณาติดต่อทีม ChatPOS",
      });
    }
    if (!fresh.hold_requested_at && String(fresh.status) !== "review_required") {
      return Response.json({
        status: String(fresh.status),
        waiting: true,
        merchantContactDeadline: String(fresh.merchant_contact_deadline),
        message: "ยังอยู่ในช่วง 48 ชั่วโมงที่รอร้านติดต่อ",
      });
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    await db.prepare(`
      INSERT INTO stoppay_lookups
        (token, operation_id, merchant_id, amount_cents, paid_at, slip_reference, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+30 minutes'))
    `).bind(
      token,
      String(fresh.operation_id),
      String(fresh.merchant_id),
      Number(fresh.amount_cents),
      String(fresh.paid_at),
      fresh.slip_reference ? String(fresh.slip_reference) : null,
    ).run();

    return Response.json({
      ready: true,
      lookupToken: token,
      caseNumber,
      merchantName: String(row.merchant_name),
      amount: Number(fresh.amount_cents) / 100,
      status: String(fresh.status),
      message: "ครบกำหนด 48 ชั่วโมงแล้ว กรุณายืนยัน OTP อีกครั้งเพื่อส่งเรื่องขอคืนเงินเข้าตรวจสอบ",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ตรวจสอบเคสไม่สำเร็จ" }, { status: 500 });
  }
}
