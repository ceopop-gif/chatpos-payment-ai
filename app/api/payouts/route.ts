import { getD1 } from "../../../db";
import { getMerchantSession, unauthorizedResponse } from "../../../lib/merchant-auth";
import {
  callChatpos,
  materializeMerchantGatewayConfig,
  moneyToCents,
  sha256Hex,
} from "../../../lib/chatpos-gateway";

type PayoutRequest = {
  clientRequestId?: string;
  amount?: number;
  payoutMethod?: "bank_account" | "truemoney" | "promptpay";
  description?: string;
  beneficiary?: Record<string, unknown>;
};

function getData(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  return root.success === true && root.data && typeof root.data === "object"
    ? root.data as Record<string, unknown>
    : null;
}

export async function POST(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();

    const input = await request.json() as PayoutRequest;
    const clientReference = String(input.clientRequestId ?? "").trim();
    const amountCents = moneyToCents(input.amount);
    const payoutMethod = String(input.payoutMethod ?? "");
    const beneficiary = input.beneficiary && typeof input.beneficiary === "object" ? input.beneficiary : null;

    if (!/^[a-zA-Z0-9:_-]{8,80}$/.test(clientReference) || !["bank_account", "truemoney", "promptpay"].includes(payoutMethod) || !beneficiary) {
      return Response.json({ error: "ข้อมูลถอนเงินไม่ถูกต้อง" }, { status: 400 });
    }
    if (amountCents > 5_000_000) {
      return Response.json({ error: "ถอนสูงสุด 50,000 บาทต่อรายการ" }, { status: 422 });
    }

    const db = getD1();
    const configRow = await db.prepare(
      "SELECT * FROM chatpos_merchant_configs WHERE merchant_id = ? AND enabled = 1 LIMIT 1"
    ).bind(session.applicationId).first();
    if (!configRow) {
      return Response.json({ error: "ร้านนี้ยังไม่ได้เปิดการเชื่อมต่อ ChatPOS Gateway" }, { status: 503 });
    }
    const config = materializeMerchantGatewayConfig(configRow as Record<string, unknown>);

    const existing = await db.prepare(
      "SELECT * FROM chatpos_gateway_operations WHERE merchant_id = ? AND operation_type = 'payout' AND client_reference = ? LIMIT 1"
    ).bind(session.applicationId, clientReference).first();
    if (existing) {
      return Response.json({
        operation: {
          id: existing.id,
          gatewayReference: existing.gateway_reference,
          clientReference: existing.client_reference,
          status: existing.status,
          providerStatus: existing.provider_status,
          providerCode: existing.provider_code,
          amount: Number(existing.amount_cents) / 100,
          method: existing.method,
          response: existing.response_json ? JSON.parse(String(existing.response_json)) : null,
        },
        replayed: true,
      });
    }

    const commercial = structuredClone(config.commercial) as Record<string, any>;
    commercial.relationship ??= {};
    commercial.relationship.agentReference = config.agentReference;
    commercial.relationship.pdReference = config.partnerReference;
    if (!commercial.withdrawalFee || typeof commercial.withdrawalFee !== "object") {
      return Response.json({ error: "ยังไม่ได้ตั้งค่า withdrawalFee ของร้าน" }, { status: 503 });
    }

    const gatewayPayload = {
      clientReference,
      merchantReference: config.merchantReference,
      branchReference: config.branchReference,
      businessUnitReference: config.businessUnitReference,
      agentReference: config.agentReference,
      partnerReference: config.partnerReference,
      amount: (amountCents / 100).toFixed(2),
      currency: "THB",
      payoutMethod,
      description: String(input.description ?? "ChatPOS merchant payout").slice(0, 500),
      commercial,
      beneficiary,
      ...(config.webhookCallbackUrl ? { webhookCallbackUrl: config.webhookCallbackUrl } : {}),
      metadata: { merchantId: session.applicationId, source: "chatpos-merchant-system-v2" },
    };

    const payloadJson = JSON.stringify(gatewayPayload);
    const payloadHash = await sha256Hex(payloadJson);
    const operationId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();

    await db.prepare(`
      INSERT INTO chatpos_gateway_operations
        (id, merchant_id, operation_type, client_reference, idempotency_key, payload_hash,
         amount_cents, currency, method, status)
      VALUES (?, ?, 'payout', ?, ?, ?, ?, 'THB', ?, 'pending')
    `).bind(operationId, session.applicationId, clientReference, idempotencyKey, payloadHash, amountCents, payoutMethod).run();

    let gateway;
    try {
      gateway = await callChatpos(config, "/api/v1/payouts", {
        method: "POST",
        body: payloadJson,
        idempotencyKey,
      });
    } catch (error) {
      await db.prepare(
        "UPDATE chatpos_gateway_operations SET status = 'verification_pending', provider_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(error instanceof Error ? error.message : "Gateway request failed", operationId).run();
      return Response.json({
        operation: { id: operationId, clientReference, status: "verification_pending" },
        message: "ยังไม่ทราบผลการโอน ต้องตรวจรายการเดิม ห้ามสร้าง payout ใหม่ซ้ำ",
      }, { status: 202 });
    }

    const data = getData(gateway.body);
    const status = data ? String(data.status ?? "processing") : (gateway.status >= 500 ? "verification_pending" : "failed");
    const gatewayReference = data?.gatewayReference ? String(data.gatewayReference) : null;
    const providerStatus = data?.providerStatus ? String(data.providerStatus) : null;
    const providerCode = data?.providerCode ? String(data.providerCode) : null;
    const providerMessage = data?.providerMessage ? String(data.providerMessage) : null;

    await db.prepare(`
      UPDATE chatpos_gateway_operations
      SET gateway_reference = ?, status = ?, provider_status = ?, provider_code = ?,
          provider_message = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      gatewayReference, status, providerStatus, providerCode, providerMessage,
      JSON.stringify(gateway.body ?? null), operationId,
    ).run();

    return Response.json({
      operation: {
        id: operationId,
        gatewayReference,
        clientReference,
        status,
        providerStatus,
        providerCode,
        amount: amountCents / 100,
        method: payoutMethod,
      },
      gateway: data ?? gateway.body,
    }, { status: data ? 201 : (gateway.status >= 400 ? gateway.status : 502) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "สร้างรายการถอนเงินไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
