import { getD1 } from "../../../db";
import { getMerchantSession, unauthorizedResponse } from "../../../lib/merchant-auth";
import { calculatePaymentFee, membershipSnapshot, recordPaymentFinancials } from "../../../lib/membership-billing";

const allowedMethods = new Set(["promptpay", "visa", "truemoney", "wechat", "alipay", "mobile", "shopeepay"]);

export async function POST(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();

    const payload = (await request.json()) as {
      clientRequestId?: string;
      method?: string;
      amount?: number;
      context?: string;
    };
    const clientRequestId = String(payload.clientRequestId ?? "").trim();
    const method = String(payload.method ?? "").trim().toLowerCase();
    const amountCents = Math.round(Number(payload.amount) * 100);
    const context = String(payload.context ?? "").trim().slice(0, 120);

    if (!/^[a-zA-Z0-9-]{12,80}$/.test(clientRequestId) || !allowedMethods.has(method) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 50_000_00) {
      return Response.json({ error: "ข้อมูลรายการชำระเงินไม่ถูกต้อง" }, { status: 400 });
    }

    const db = getD1();
    const existing = await db.prepare(
      "SELECT id, method, amount_cents, fee_rate_bps, fee_cents, net_amount_cents, membership_plan, free_quota_applied_cents, created_at FROM payment_transactions WHERE client_request_id = ? LIMIT 1"
    ).bind(clientRequestId).first();
    if (existing) {
      return Response.json({
        transaction: {
          id: String(existing.id),
          method: String(existing.method),
          amount: Number(existing.amount_cents) / 100,
          feeRate: Number(existing.fee_rate_bps ?? 0) / 100,
          fee: Number(existing.fee_cents ?? 0) / 100,
          netAmount: Number(existing.net_amount_cents ?? existing.amount_cents) / 100,
          plan: String(existing.membership_plan ?? "standard"),
          freeQuotaApplied: Number(existing.free_quota_applied_cents ?? 0) / 100,
          createdAt: String(existing.created_at),
        },
      });
    }

    const id = crypto.randomUUID();
    const fee = await calculatePaymentFee(db, session.applicationId, method, amountCents);
    await db.prepare(`
      INSERT INTO payment_transactions
        (id, merchant_id, client_request_id, method, amount_cents, context, source, status,
         fee_rate_bps, fee_cents, net_amount_cents, membership_plan, free_quota_applied_cents, quota_cycle_started_at)
      VALUES (?, ?, ?, ?, ?, ?, 'merchant_app', 'success', ?, ?, ?, ?, ?, ?)
    `).bind(
      id, session.applicationId, clientRequestId, method, amountCents, context,
      fee.feeRateBps, fee.feeCents, fee.netAmountCents, fee.plan, fee.freeQuotaAppliedCents, fee.cycleStart,
    ).run();
    await recordPaymentFinancials(db, session.applicationId, fee);
    const membership = await membershipSnapshot(db, session.applicationId);

    return Response.json({
      transaction: {
        id, method, amount: amountCents / 100, feeRate: fee.feeRateBps / 100,
        fee: fee.feeCents / 100, netAmount: fee.netAmountCents / 100, plan: fee.plan,
        freeQuotaApplied: fee.freeQuotaAppliedCents / 100,
      },
      membership,
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึกรายการชำระเงินไม่สำเร็จ" }, { status: 500 });
  }
}
