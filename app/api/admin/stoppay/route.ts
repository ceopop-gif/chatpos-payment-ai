import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";
import { ensureStopPaySchema } from "../../../../lib/stoppay";

export async function GET(request: Request) {
  const session = await getAdminSession(request);
  if (!session) return adminUnauthorized();
  await ensureStopPaySchema();
  const db = getD1();

  await db.prepare(`
    UPDATE stoppay_cases
    SET status = 'review_required',
        hold_requested_at = COALESCE(hold_requested_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'merchant_action_required'
      AND merchant_contacted_at IS NULL
      AND merchant_contact_deadline <= CURRENT_TIMESTAMP
  `).run();

  const result = await db.prepare(`
    SELECT c.case_number, c.operation_id, c.gateway_reference, c.merchant_id, c.amount_cents, c.paid_at,
           c.slip_reference, c.reporter_name, c.reporter_phone, c.reason_code, c.reason_detail,
           c.status, c.merchant_contact_deadline, c.merchant_contacted_at, c.merchant_response_note,
           c.hold_requested_at, c.refund_review_requested_at, c.resolved_at, c.created_at, c.updated_at,
           cfg.merchant_name, cfg.merchant_reference
    FROM stoppay_cases c
    JOIN chatpos_merchant_configs cfg ON cfg.merchant_id = c.merchant_id
    ORDER BY
      CASE c.status
        WHEN 'refund_review_requested' THEN 0
        WHEN 'review_required' THEN 1
        WHEN 'merchant_action_required' THEN 2
        WHEN 'merchant_contacted' THEN 3
        ELSE 4
      END,
      c.created_at DESC
    LIMIT 300
  `).all();

  return Response.json({
    cases: (result.results ?? []).map((row: Record<string, unknown>) => ({
      caseNumber: String(row.case_number),
      operationId: String(row.operation_id),
      gatewayReference: row.gateway_reference ? String(row.gateway_reference) : null,
      merchantId: String(row.merchant_id),
      merchantName: String(row.merchant_name),
      merchantReference: String(row.merchant_reference ?? ""),
      amount: Number(row.amount_cents) / 100,
      paidAt: String(row.paid_at),
      slipReference: row.slip_reference ? String(row.slip_reference) : null,
      reporterName: String(row.reporter_name),
      reporterPhone: String(row.reporter_phone),
      reasonCode: String(row.reason_code),
      reasonDetail: String(row.reason_detail),
      status: String(row.status),
      merchantContactDeadline: String(row.merchant_contact_deadline),
      merchantContactedAt: row.merchant_contacted_at ? String(row.merchant_contacted_at) : null,
      merchantResponseNote: String(row.merchant_response_note ?? ""),
      holdRequestedAt: row.hold_requested_at ? String(row.hold_requested_at) : null,
      refundReviewRequestedAt: row.refund_review_requested_at ? String(row.refund_review_requested_at) : null,
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getAdminSession(request);
  if (!session) return adminUnauthorized();
  await ensureStopPaySchema();

  try {
    const input = await request.json() as { caseNumber?: string; action?: string; note?: string };
    const caseNumber = String(input.caseNumber ?? "").trim().toUpperCase();
    const action = String(input.action ?? "");
    const note = String(input.note ?? "").trim().slice(0, 2000);
    if (!caseNumber) return Response.json({ error: "กรุณาระบุเลขเคส" }, { status: 400 });

    const db = getD1();
    const row = await db.prepare("SELECT id, status FROM stoppay_cases WHERE case_number = ? LIMIT 1").bind(caseNumber).first();
    if (!row) return Response.json({ error: "ไม่พบเคส STOPPAY" }, { status: 404 });

    if (action === "hold") {
      await db.prepare(`
        UPDATE stoppay_cases
        SET status = 'review_required',
            hold_requested_at = COALESCE(hold_requested_at, CURRENT_TIMESTAMP),
            merchant_response_note = CASE WHEN ? = '' THEN merchant_response_note ELSE ? END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, note, row.id).run();
      await db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'admin_hold', 'admin', ?)"
      ).bind(crypto.randomUUID(), row.id, note).run();
      return Response.json({ success: true, status: "review_required" });
    }

    if (action === "reject") {
      if (note.length < 5) return Response.json({ error: "กรุณาระบุเหตุผลที่ปฏิเสธ" }, { status: 400 });
      await db.prepare(`
        UPDATE stoppay_cases
        SET status = 'rejected', resolved_at = CURRENT_TIMESTAMP,
            merchant_response_note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, row.id).run();
      await db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'admin_rejected', 'admin', ?)"
      ).bind(crypto.randomUUID(), row.id, note).run();
      return Response.json({ success: true, status: "rejected" });
    }

    if (action === "refund_completed") {
      if (note.length < 5) return Response.json({ error: "กรุณาระบุหลักฐานหรือหมายเหตุการคืนเงิน" }, { status: 400 });
      await db.prepare(`
        UPDATE stoppay_cases
        SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP,
            merchant_response_note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, row.id).run();
      await db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'refund_completed', 'admin', ?)"
      ).bind(crypto.randomUUID(), row.id, note).run();
      return Response.json({ success: true, status: "resolved" });
    }

    if (action === "merchant_contacted_override") {
      if (note.length < 3) return Response.json({ error: "กรุณาระบุผลการตรวจสอบ" }, { status: 400 });
      await db.prepare(`
        UPDATE stoppay_cases
        SET status = 'merchant_contacted',
            merchant_contacted_at = COALESCE(merchant_contacted_at, CURRENT_TIMESTAMP),
            hold_requested_at = NULL,
            merchant_response_note = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, row.id).run();
      await db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'admin_contact_confirmed', 'admin', ?)"
      ).bind(crypto.randomUUID(), row.id, note).run();
      return Response.json({ success: true, status: "merchant_contacted" });
    }

    return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อัปเดต STOPPAY ไม่สำเร็จ" }, { status: 500 });
  }
}
