import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";
import { ensureStopPaySchema } from "../../../../lib/stoppay";

export async function GET(request: Request) {
  const session = await getAdminSession(request);
  if (!session) return adminUnauthorized();
  await ensureStopPaySchema();

  const result = await getD1().prepare(`
    SELECT c.case_number, c.gateway_reference, c.merchant_id, c.amount_cents, c.paid_at,
           c.slip_reference, c.reporter_name, c.reporter_phone, c.reason_code, c.reason_detail,
           c.status, c.hold_requested_at, c.created_at, c.updated_at,
           cfg.merchant_name, cfg.merchant_reference
    FROM stoppay_cases c
    JOIN chatpos_merchant_configs cfg ON cfg.merchant_id = c.merchant_id
    WHERE c.status IN ('team_review_required', 'under_team_review', 'refund_review_requested', 'review_required')
      AND c.resolved_at IS NULL
    ORDER BY
      CASE c.status WHEN 'team_review_required' THEN 0 WHEN 'under_team_review' THEN 1 ELSE 2 END,
      c.created_at DESC
    LIMIT 300
  `).all();

  return Response.json({
    cases: (result.results ?? []).map((row: Record<string, unknown>) => ({
      caseNumber: String(row.case_number),
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
      heldAt: row.hold_requested_at ? String(row.hold_requested_at) : null,
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
    const db = getD1();
    const row = await db.prepare(
      "SELECT id, status FROM stoppay_cases WHERE case_number = ? AND resolved_at IS NULL LIMIT 1"
    ).bind(caseNumber).first();
    if (!row) return Response.json({ error: "ไม่พบเคส STOPPAY ที่เปิดอยู่" }, { status: 404 });

    if (action === "accept_review") {
      await db.prepare(`
        UPDATE stoppay_cases
        SET status = 'under_team_review',
            merchant_response_note = CASE WHEN ? = '' THEN merchant_response_note ELSE ? END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, note, row.id).run();
      await db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'team_review_started', 'team', ?)"
      ).bind(crypto.randomUUID(), row.id, note).run();
      return Response.json({ success: true, status: "under_team_review" });
    }

    if (action === "cancel_stoppay") {
      if (note.length < 5) return Response.json({ error: "กรุณาระบุเหตุผลที่ยกเลิก STOPPAY" }, { status: 400 });
      await db.prepare(`
        UPDATE stoppay_cases
        SET status = 'cancelled_by_team',
            hold_requested_at = NULL,
            resolved_at = CURRENT_TIMESTAMP,
            merchant_response_note = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, row.id).run();
      await db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'team_cancelled_stoppay', 'team', ?)"
      ).bind(crypto.randomUUID(), row.id, note).run();
      return Response.json({ success: true, status: "cancelled_by_team", unlocked: true });
    }

    if (action === "keep_hold") {
      await db.prepare(`
        UPDATE stoppay_cases
        SET status = 'under_team_review',
            hold_requested_at = COALESCE(hold_requested_at, CURRENT_TIMESTAMP),
            merchant_response_note = CASE WHEN ? = '' THEN merchant_response_note ELSE ? END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, note, row.id).run();
      await db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'team_kept_hold', 'team', ?)"
      ).bind(crypto.randomUUID(), row.id, note).run();
      return Response.json({ success: true, status: "under_team_review", held: true });
    }

    return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อัปเดต STOPPAY ไม่สำเร็จ" }, { status: 500 });
  }
}
