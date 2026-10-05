import { getD1 } from "../../../../../db";
import { ensureStopPaySchema, getVerifiedSession } from "../../../../../lib/stoppay";

export async function POST(request: Request) {
  try {
    await ensureStopPaySchema();
    const input = await request.json() as { caseNumber?: string; verificationToken?: string };
    const caseNumber = String(input.caseNumber ?? "").trim().toUpperCase();
    const verified = await getVerifiedSession(String(input.verificationToken ?? ""));
    if (!verified) return Response.json({ error: "การยืนยัน OTP หมดอายุ กรุณายืนยันใหม่" }, { status: 401 });

    const db = getD1();
    const row = await db.prepare(
      "SELECT * FROM stoppay_cases WHERE case_number = ? AND operation_id = ? AND reporter_phone = ? LIMIT 1"
    ).bind(caseNumber, String(verified.operation_id), String(verified.phone)).first();
    if (!row) return Response.json({ error: "ข้อมูลผู้แจ้งไม่ตรงกับเคส" }, { status: 403 });
    if (row.merchant_contacted_at) {
      return Response.json({ error: "ร้านบันทึกว่าติดต่อผู้แจ้งแล้ว กรุณาติดต่อทีม ChatPOS หากยังมีข้อพิพาท" }, { status: 409 });
    }
    if (!row.hold_requested_at) {
      return Response.json({ error: "เคสยังไม่ครบกำหนด 48 ชั่วโมง" }, { status: 409 });
    }

    await db.prepare(`
      UPDATE stoppay_cases
      SET status = 'refund_review_requested',
          refund_review_requested_at = COALESCE(refund_review_requested_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(row.id).run();
    await db.prepare(
      "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'refund_review_requested', 'customer', 'OTP re-verified after 48h')"
    ).bind(crypto.randomUUID(), row.id).run();

    return Response.json({
      success: true,
      status: "refund_review_requested",
      message: "ส่งคำขอคืนเงินเข้าตรวจสอบแล้ว ระบบยังคงระงับการถอนของร้านจนกว่าจะสรุปเคส",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ส่งคำขอคืนเงินไม่สำเร็จ" }, { status: 500 });
  }
}
