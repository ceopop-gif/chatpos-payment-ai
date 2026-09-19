import { getD1 } from "../../../db";
import { getMerchantSession, unauthorizedResponse } from "../../../lib/merchant-auth";
import {
  callChatpos,
  materializeMerchantGatewayConfig,
  moneyToCents,
  normalizePaymentMethod,
  sha256Hex,
} from "../../../lib/chatpos-gateway";

const allowedMethods = new Set([
  "promptpay", "card", "checkout", "alipay_online", "installment", "linepay",
  "mobile_banking", "paotang", "shopeepay", "truemoney", "wechatpay",
  "counter_pay", "alipay_offline", "direct_debit", "alipay_hk", "touch_n_go",
  "kakao_pay", "grabpay_sg",
]);

type PaymentRequest = {
  clientRequestId?: string;
  orderNo?: string;
  method?: string;
  amount?: number;
  context?: string;
  customer?: { name?: string; phone?: string; email?: string };
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

    const input = await request.json() as PaymentRequest;
    const clientReference = String(input.clientRequestId ?? "").trim();
    const orderNo = String(input.orderNo ?? input.clientRequestId ?? "").trim();
    const method = normalizePaymentMethod(String(input.method ?? ""));
    const amountCents = moneyToCents(input.amount);
    const description = String(input.context ?? "ChatPOS payment").trim().slice(0, 1000);

    if (!/^[a-zA-Z0-9:_-]{8,80}$/.test(clientReference) || !orderNo || !allowedMethods.has(method)) {
      return Response.json({ error: "ข้อมูลรายการชำระเงินไม่ถูกต้อง" }, { status: 400 });
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
      "SELECT * FROM chatpos_gateway_operations WHERE merchant_id = ? AND operation_type = 'payment' AND client_reference = ? LIMIT 1"
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

    const customer = {
      name: String(input.customer?.name ?? config.contactName).trim(),
      phone: String(input.customer?.phone ?? config.phone).trim(),
      ...(input.customer?.email ? { email: String(input.customer.email).trim() } : {}),
    };

    const commercial = structuredClone(config.commercial) as Record<string, any>;
    commercial.relationship ??= {};
    commercial.relationship.agentReference = config.agentReference;
    commercial.relationship.pdReference = config.partnerReference;

    const gatewayPayload: Record<string, unknown> = {
      clientReference,
      orderNo,
      merchantReference: config.merchantReference,
      branchReference: config.branchReference,
      businessUnitReference: config.businessUnitReference,
      agentReference: config.agentReference,
      partnerReference: config.partnerReference,
      merchant: {
        name: config.merchantName,
        contactName: config.contactName,
        phone: config.phone,
        email: config.email,
      },
      amount: amountCents / 100,
      currency: "THB",
      paymentMethod: method,
      description,
      customer,
      commercial,
      ...(config.successRedirectUrl ? { redirectUrl: config.successRedirectUrl } : {}),
      ...(config.failedRedirectUrl ? { failedRedirectUrl: config.failedRedirectUrl } : {}),
      ...(config.webhookCallbackUrl ? { webhookCallbackUrl: config.webhookCallbackUrl } : {}),
      ...(method === "promptpay" ? { paymentMethodOption: "THAI_QR" } : {}),
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
      VALUES (?, ?, 'payment', ?, ?, ?, ?, 'THB', ?, 'pending')
    `).bind(
      operationId,
      session.applicationId,
      clientReference,
      idempotencyKey,
      payloadHash,
      amountCents,
      method,
    ).run();

    let gateway;
    try {
      gateway = await callChatpos(config, "/api/v1/payments", {
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
        message: "ยังไม่ทราบผลจาก Gateway ระบบจะต้องตรวจรายการเดิม ห้ามสร้างรายการใหม่ซ้ำ",
      }, { status: 202 });
    }

    const data = getData(gateway.body);
    const status = data ? String(data.status ?? "pending") : (gateway.status >= 500 ? "verification_pending" : "failed");
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
      gatewayReference,
      status,
      providerStatus,
      providerCode,
      providerMessage,
      JSON.stringify(gateway.body ?? null),
      operationId,
    ).run();

    if (!data) {
      return Response.json({
        operation: { id: operationId, clientReference, status },
        gateway: gateway.body,
      }, { status: gateway.status >= 400 ? gateway.status : 502 });
    }

    return Response.json({
      operation: {
        id: operationId,
        gatewayReference,
        clientReference,
        status,
        providerStatus,
        providerCode,
        amount: amountCents / 100,
        method,
        qrString: data.qrString ?? null,
        qrImageUrl: data.qrImageUrl ?? null,
        checkoutRedirectUrl: data.checkoutRedirectUrl ?? null,
        expiresAt: data.expiresAt ?? null,
      },
    }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "สร้างรายการ ChatPOS ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
