import { getD1 } from "../../../../../db";
import {
  materializeMerchantGatewayConfig,
  sha256Hex,
  verifyWebhookSignature,
} from "../../../../../lib/chatpos-gateway";

export async function POST(request: Request, context: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await context.params;
  const db = getD1();

  const configRow = await db.prepare(
    "SELECT * FROM chatpos_merchant_configs WHERE merchant_id = ? AND enabled = 1 LIMIT 1"
  ).bind(merchantId).first();
  if (!configRow) return Response.json({ error: "Unknown merchant" }, { status: 404 });

  const config = materializeMerchantGatewayConfig(configRow as Record<string, unknown>);
  const eventId = request.headers.get("X-LLGW-Event-Id") ?? "";
  const timestamp = request.headers.get("X-LLGW-Timestamp") ?? "";
  const signature = request.headers.get("X-LLGW-Signature") ?? "";
  const rawBody = new Uint8Array(await request.arrayBuffer());

  let event: { eventId?: string; eventType?: string; data?: Record<string, unknown> };
  try {
    event = await verifyWebhookSignature({
      rawBody,
      timestamp,
      signature,
      eventId,
      secret: config.webhookSecret,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_WEBHOOK";
    return Response.json({ error: code }, { status: code === "INVALID_EVENT" || code === "EVENT_TYPE_MISMATCH" ? 400 : 401 });
  }

  const bodyHash = await sha256Hex(rawBody);
  const data = event.data ?? {};
  const gatewayReference = data.gatewayReference ? String(data.gatewayReference) : null;
  const existing = await db.prepare(
    "SELECT id, body_hash, processing_state FROM chatpos_webhook_inbox WHERE environment = ? AND merchant_id = ? AND event_id = ? LIMIT 1"
  ).bind(config.environment, merchantId, eventId).first();

  if (existing) {
    if (String(existing.body_hash) !== bodyHash) {
      return Response.json({ error: "EVENT_ID_BODY_MISMATCH" }, { status: 409 });
    }
    return Response.json({ success: true, duplicate: true });
  }

  const inboxId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO chatpos_webhook_inbox
      (id, merchant_id, environment, event_id, event_type, body_hash, gateway_reference, processing_state)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'received')
  `).bind(
    inboxId,
    merchantId,
    config.environment,
    eventId,
    String(event.eventType ?? "unknown"),
    bodyHash,
    gatewayReference,
  ).run();

  try {
    if (!gatewayReference) {
      await db.prepare(
        "UPDATE chatpos_webhook_inbox SET processing_state = 'quarantined', error_message = 'Missing gatewayReference', processed_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(inboxId).run();
      return Response.json({ success: true, quarantined: true });
    }

    const operation = await db.prepare(
      "SELECT * FROM chatpos_gateway_operations WHERE merchant_id = ? AND gateway_reference = ? LIMIT 1"
    ).bind(merchantId, gatewayReference).first();

    if (!operation) {
      await db.prepare(
        "UPDATE chatpos_webhook_inbox SET processing_state = 'unmatched', error_message = 'Operation not found yet', processed_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(inboxId).run();
      return Response.json({ success: true, unmatched: true });
    }

    const incomingAmountCents = data.amount === undefined ? Number(operation.amount_cents) : Math.round(Number(data.amount) * 100);
    const incomingCurrency = String(data.currency ?? operation.currency);
    const clientReference = String(data.clientReference ?? operation.client_reference);

    if (
      incomingAmountCents !== Number(operation.amount_cents) ||
      incomingCurrency !== String(operation.currency) ||
      clientReference !== String(operation.client_reference)
    ) {
      await db.prepare(
        "UPDATE chatpos_webhook_inbox SET processing_state = 'quarantined', error_message = 'Transaction identity mismatch', processed_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(inboxId).run();
      return Response.json({ success: true, quarantined: true });
    }

    const previousStatus = String(operation.status);
    const incomingStatus = String(data.status ?? previousStatus);
    const finalSuccess = previousStatus === "success";
    const nextStatus = finalSuccess && incomingStatus !== "success" ? "success" : incomingStatus;

    await db.prepare(`
      UPDATE chatpos_gateway_operations
      SET status = ?, provider_status = ?, provider_code = ?, provider_message = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      nextStatus,
      data.providerStatus ? String(data.providerStatus) : operation.provider_status,
      data.providerCode ? String(data.providerCode) : operation.provider_code,
      data.providerMessage ? String(data.providerMessage) : operation.provider_message,
      operation.id,
    ).run();

    await db.prepare(
      "UPDATE chatpos_webhook_inbox SET processing_state = 'processed', processed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(inboxId).run();

    return Response.json({ success: true });
  } catch (error) {
    await db.prepare(
      "UPDATE chatpos_webhook_inbox SET processing_state = 'error', error_message = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(error instanceof Error ? error.message : "Webhook processing failed", inboxId).run();
    return Response.json({ error: "WEBHOOK_PERSISTENCE_ERROR" }, { status: 500 });
  }
}
