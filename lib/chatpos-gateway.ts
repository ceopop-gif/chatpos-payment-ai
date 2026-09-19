import { env } from "cloudflare:workers";

type RuntimeEnv = Record<string, unknown>;

export type ChatposOperationType = "payment" | "payout";

export type MerchantGatewayConfig = {
  merchantId: string;
  enabled: boolean;
  environment: "test" | "live";
  baseUrl: string;
  apiSecret: string;
  webhookSecret: string;
  merchantReference: string;
  branchReference: string;
  businessUnitReference: string;
  agentReference: string;
  partnerReference: string;
  merchantName: string;
  contactName: string;
  phone: string;
  email: string;
  commercial: Record<string, unknown>;
  webhookCallbackUrl?: string | null;
  successRedirectUrl?: string | null;
  failedRedirectUrl?: string | null;
};

function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

function secretFromBinding(name: string) {
  const value = runtimeEnv()[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing server secret binding: ${name}`);
  }
  return value.trim();
}

export function materializeMerchantGatewayConfig(row: Record<string, unknown>): MerchantGatewayConfig {
  let commercial: Record<string, unknown>;
  try {
    commercial = JSON.parse(String(row.commercial_json ?? "{}"));
  } catch {
    throw new Error("Invalid commercial_json in ChatPOS merchant configuration");
  }

  const environment = String(row.environment ?? "test") === "live" ? "live" : "test";
  const apiSecret = secretFromBinding(String(row.credential_env_name ?? ""));
  const webhookSecret = secretFromBinding(String(row.webhook_secret_env_name ?? ""));

  if (environment === "live" && !apiSecret.startsWith("llgw_live_")) {
    throw new Error("Live ChatPOS config requires llgw_live_ credential");
  }
  if (environment === "test" && !apiSecret.startsWith("llgw_test_")) {
    throw new Error("Test ChatPOS config requires llgw_test_ credential");
  }

  return {
    merchantId: String(row.merchant_id),
    enabled: Number(row.enabled) === 1,
    environment,
    baseUrl: String(row.base_url).replace(/\/$/, ""),
    apiSecret,
    webhookSecret,
    merchantReference: String(row.merchant_reference),
    branchReference: String(row.branch_reference),
    businessUnitReference: String(row.business_unit_reference),
    agentReference: String(row.agent_reference),
    partnerReference: String(row.partner_reference),
    merchantName: String(row.merchant_name),
    contactName: String(row.contact_name),
    phone: String(row.phone),
    email: String(row.email),
    commercial,
    webhookCallbackUrl: row.webhook_callback_url ? String(row.webhook_callback_url) : null,
    successRedirectUrl: row.success_redirect_url ? String(row.success_redirect_url) : null,
    failedRedirectUrl: row.failed_redirect_url ? String(row.failed_redirect_url) : null,
  };
}

export function normalizePaymentMethod(method: string) {
  const value = method.trim().toLowerCase();
  const aliases: Record<string, string> = {
    visa: "card",
    credit_card: "card",
    wechat: "wechatpay",
    mobile: "mobile_banking",
  };
  return aliases[value] ?? value;
}

export function moneyToCents(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("Invalid amount");
  const cents = Math.round(numeric * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid amount");
  return cents;
}

export async function sha256Hex(input: string | Uint8Array) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function callChatpos(
  config: MerchantGatewayConfig,
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.apiSecret}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { ok: response.ok, status: response.status, headers: response.headers, body };
  } finally {
    clearTimeout(timeout);
  }
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyWebhookSignature(args: {
  rawBody: Uint8Array;
  timestamp: string;
  signature: string;
  eventId: string;
  secret: string;
  toleranceSeconds?: number;
}) {
  const tolerance = args.toleranceSeconds ?? 300;
  if (!/^\d{1,12}$/.test(args.timestamp)) throw new Error("INVALID_TIMESTAMP");
  const deliveredAt = Number(args.timestamp);
  if (Math.abs(Math.floor(Date.now() / 1000) - deliveredAt) > tolerance) throw new Error("TIMESTAMP_OUTSIDE_WINDOW");
  if (!/^v1=[0-9a-fA-F]{64}$/.test(args.signature)) throw new Error("INVALID_SIGNATURE");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(args.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prefix = new TextEncoder().encode(`${args.timestamp}.`);
  const signed = new Uint8Array(prefix.length + args.rawBody.length);
  signed.set(prefix, 0);
  signed.set(args.rawBody, prefix.length);
  const expected = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, signed)));
  if (!constantTimeEqual(expected.toLowerCase(), args.signature.slice(3).toLowerCase())) {
    throw new Error("INVALID_SIGNATURE");
  }

  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(args.rawBody);
  const event = JSON.parse(decoded) as { eventId?: string; eventType?: string; data?: Record<string, unknown> };
  if (!event || typeof event !== "object" || !event.data || event.eventId !== args.eventId) {
    throw new Error("INVALID_EVENT");
  }
  if (event.data.eventType !== undefined && event.data.eventType !== event.eventType) {
    throw new Error("EVENT_TYPE_MISMATCH");
  }
  return event;
}
