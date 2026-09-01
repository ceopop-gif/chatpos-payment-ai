import { getD1 } from "../../../db";
import { getMerchantSession, unauthorizedResponse } from "../../../lib/merchant-auth";

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
      "SELECT id, method, amount_cents, created_at FROM payment_transactions WHERE client_request_id = ? LIMIT 1"
    ).bind(clientRequestId).first();
    if (existing) {
      return Response.json({
        transaction: {
          id: String(existing.id),
          method: String(existing.method),
          amount: Number(existing.amount_cents) / 100,
          createdAt: String(existing.created_at),
        },
      });
    }

    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO payment_transactions
        (id, merchant_id, client_request_id, method, amount_cents, context, source, status)
      VALUES (?, ?, ?, ?, ?, ?, 'merchant_app', 'success')
    `).bind(id, session.applicationId, clientRequestId, method, amountCents, context).run();

    return Response.json({ transaction: { id, method, amount: amountCents / 100 } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึกรายการชำระเงินไม่สำเร็จ" }, { status: 500 });
  }
}
