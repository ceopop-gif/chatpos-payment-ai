import { getD1 } from "../../../../db";
import { getMerchantSession, unauthorizedResponse } from "../../../../lib/merchant-auth";
import { callChatpos, materializeMerchantGatewayConfig } from "../../../../lib/chatpos-gateway";

export async function GET(request: Request, context: { params: Promise<{ gatewayReference: string }> }) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();

    const { gatewayReference } = await context.params;
    if (!/^(pay|po)_[A-Za-z0-9_-]+$/.test(gatewayReference)) {
      return Response.json({ error: "gatewayReference ไม่ถูกต้อง" }, { status: 400 });
    }

    const db = getD1();
    const operation = await db.prepare(
      "SELECT * FROM chatpos_gateway_operations WHERE merchant_id = ? AND gateway_reference = ? LIMIT 1"
    ).bind(session.applicationId, gatewayReference).first();
    if (!operation) return Response.json({ error: "ไม่พบรายการ" }, { status: 404 });

    const configRow = await db.prepare(
      "SELECT * FROM chatpos_merchant_configs WHERE merchant_id = ? AND enabled = 1 LIMIT 1"
    ).bind(session.applicationId).first();
    if (!configRow) return Response.json({ error: "ร้านนี้ยังไม่ได้เปิด ChatPOS Gateway" }, { status: 503 });

    const config = materializeMerchantGatewayConfig(configRow as Record<string, unknown>);
    const type = String(operation.operation_type);
    const path = type === "payout"
      ? `/api/v1/payouts/${encodeURIComponent(gatewayReference)}`
      : `/api/v1/payments/${encodeURIComponent(gatewayReference)}`;

    const gateway = await callChatpos(config, path, { method: "GET" });
    const root = gateway.body && typeof gateway.body === "object" ? gateway.body as Record<string, unknown> : null;
    const data = root?.success === true && root.data && typeof root.data === "object"
      ? root.data as Record<string, unknown>
      : null;

    if (data) {
      await db.prepare(`
        UPDATE chatpos_gateway_operations
        SET status = ?, provider_status = ?, provider_code = ?, provider_message = ?,
            response_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        String(data.status ?? operation.status),
        data.providerStatus ? String(data.providerStatus) : null,
        data.providerCode ? String(data.providerCode) : null,
        data.providerMessage ? String(data.providerMessage) : null,
        JSON.stringify(gateway.body),
        operation.id,
      ).run();
    }

    return Response.json({
      operation: {
        id: operation.id,
        gatewayReference,
        type,
        status: data?.status ?? operation.status,
        providerStatus: data?.providerStatus ?? operation.provider_status,
        providerCode: data?.providerCode ?? operation.provider_code,
        amount: Number(operation.amount_cents) / 100,
        currency: operation.currency,
        method: operation.method,
      },
      gateway: gateway.body,
    }, { status: gateway.status >= 400 ? gateway.status : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ตรวจสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
