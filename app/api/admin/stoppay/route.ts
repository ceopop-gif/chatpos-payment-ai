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
  return Response.json({
    error: "การยกเลิกหรือปลดล็อก STOPPAY ต้องดำเนินการจากหลังบ้าน Team เท่านั้น",
    teamUrl: "/team/stoppay",
  }, { status: 403 });
}
