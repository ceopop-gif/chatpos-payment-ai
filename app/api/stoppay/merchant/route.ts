import { getD1 } from "../../../../db";
import { getMerchantSession, unauthorizedResponse } from "../../../../lib/merchant-auth";
import { ensureStopPaySchema, promoteExpiredCasesForMerchant } from "../../../../lib/stoppay";

export async function GET(request: Request) {
  const session = await getMerchantSession(request);
  if (!session) return unauthorizedResponse();
  await promoteExpiredCasesForMerchant(session.applicationId);

  const rows = await getD1().prepare(`
    SELECT case_number, amount_cents, paid_at, reporter_name, reporter_phone,
           reason_code, reason_detail, status, merchant_contact_deadline,
           merchant_contacted_at, merchant_response_note, hold_requested_at, created_at
    FROM stoppay_cases
    WHERE merchant_id = ?
      AND status NOT IN ('resolved', 'rejected')
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(session.applicationId).all();

  return Response.json({
    cases: (rows.results ?? []).map((row: Record<string, unknown>) => ({
      caseNumber: String(row.case_number),
      amount: Number(row.amount_cents) / 100,
      paidAt: String(row.paid_at),
      reporterName: String(row.reporter_name),
      reporterPhone: String(row.reporter_phone),
      reasonCode: String(row.reason_code),
      reasonDetail: String(row.reason_detail),
      status: String(row.status),
      merchantContactDeadline: String(row.merchant_contact_deadline),
      merchantContactedAt: row.merchant_contacted_at ? String(row.merchant_contacted_at) : null,
      merchantResponseNote: String(row.merchant_response_note ?? ""),
      holdRequestedAt: row.hold_requested_at ? String(row.hold_requested_at) : null,
      createdAt: String(row.created_at),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getMerchantSession(request);
  if (!session) return unauthorizedResponse();
  await ensureStopPaySchema();

  try {
    const input = await request.json() as { caseNumber?: string; action?: string; note?: string };
    const caseNumber = String(input.caseNumber ?? "").trim();
    const action = String(input.action ?? "");
    const note = String(input.note ?? "").trim().slice(0, 1000);
    const db = getD1();
    const row = await db.prepare(
      "SELECT id, status FROM stoppay_cases WHERE case_number = ? AND merchant_id = ? LIMIT 1"
    ).bind(caseNumber, session.applicationId).first();
    if (!row) return Response.json({ error: "ไม่พบเคส STOPPAY" }, { status: 404 });

    if (action === "contacted") {
      await db.prepare(`
        UPDATE stoppay_cases
        SET merchant_contacted_at = COALESCE(merchant_contacted_at, CURRENT_TIMESTAMP),
            merchant_response_note = ?,
            status = CASE WHEN status = 'merchant_action_required' THEN 'merchant_contacted' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, row.id).run();
      await db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'merchant_contacted', 'merchant', ?)"
      ).bind(crypto.randomUUID(), row.id, note).run();
      return Response.json({ success: true, status: "merchant_contacted" });
    }

    if (action === "resolved") {
      await db.prepare(`
        UPDATE stoppay_cases
        SET resolved_at = CURRENT_TIMESTAMP, status = 'resolved', merchant_response_note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, row.id).run();
      await db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'merchant_resolved', 'merchant', ?)"
      ).bind(crypto.randomUUID(), row.id, note).run();
      return Response.json({ success: true, status: "resolved" });
    }

    return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
