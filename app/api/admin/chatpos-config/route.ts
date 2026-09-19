import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";

type ConfigInput = {
  merchantId?: string;
  enabled?: boolean;
  environment?: "test" | "live";
  baseUrl?: string;
  credentialEnvName?: string;
  webhookSecretEnvName?: string;
  merchantReference?: string;
  branchReference?: string;
  businessUnitReference?: string;
  agentReference?: string;
  partnerReference?: string;
  merchantName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  commercial?: Record<string, unknown>;
  webhookCallbackUrl?: string | null;
  successRedirectUrl?: string | null;
  failedRedirectUrl?: string | null;
};

function clean(value: unknown, max = 255) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(request: Request) {
  const admin = await getAdminSession(request);
  if (!admin) return adminUnauthorized();

  const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
  if (!merchantId) return Response.json({ error: "merchantId is required" }, { status: 400 });

  const row = await getD1().prepare(`
    SELECT merchant_id, enabled, environment, base_url, credential_env_name, webhook_secret_env_name,
           merchant_reference, branch_reference, business_unit_reference, agent_reference, partner_reference,
           merchant_name, contact_name, phone, email, commercial_json, webhook_callback_url,
           success_redirect_url, failed_redirect_url, created_at, updated_at
    FROM chatpos_merchant_configs WHERE merchant_id = ? LIMIT 1
  `).bind(merchantId).first();

  if (!row) return Response.json({ config: null });
  return Response.json({
    config: {
      ...row,
      commercial: JSON.parse(String(row.commercial_json ?? "{}")),
      credentialConfiguredBy: String(row.credential_env_name),
      webhookSecretConfiguredBy: String(row.webhook_secret_env_name),
    },
  });
}

export async function POST(request: Request) {
  const admin = await getAdminSession(request);
  if (!admin) return adminUnauthorized();

  try {
    const input = await request.json() as ConfigInput;
    const merchantId = clean(input.merchantId, 128);
    const environment = input.environment === "live" ? "live" : "test";
    const baseUrl = clean(input.baseUrl, 2048).replace(/\/$/, "");
    const credentialEnvName = clean(input.credentialEnvName, 128);
    const webhookSecretEnvName = clean(input.webhookSecretEnvName, 128);

    if (!merchantId || !/^https:\/\//.test(baseUrl)) {
      return Response.json({ error: "merchantId และ HTTPS baseUrl จำเป็น" }, { status: 400 });
    }
    if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(credentialEnvName) || !/^[A-Z][A-Z0-9_]{2,127}$/.test(webhookSecretEnvName)) {
      return Response.json({ error: "Secret ต้องระบุเป็นชื่อ Cloudflare binding เท่านั้น" }, { status: 400 });
    }

    const db = getD1();
    const merchant = await db.prepare(
      "SELECT id, kyc_status, status FROM merchant_applications WHERE id = ? LIMIT 1"
    ).bind(merchantId).first();
    if (!merchant) return Response.json({ error: "ไม่พบร้าน" }, { status: 404 });
    if (input.enabled && (String(merchant.kyc_status) !== "approved" || String(merchant.status) !== "approved")) {
      return Response.json({ error: "เปิด API ได้เฉพาะร้านที่ KYC และสถานะร้านผ่านอนุมัติแล้ว" }, { status: 422 });
    }

    const commercial = input.commercial && typeof input.commercial === "object" ? input.commercial : {};
    const refs = {
      merchantReference: clean(input.merchantReference, 255),
      branchReference: clean(input.branchReference, 255),
      businessUnitReference: clean(input.businessUnitReference, 255),
      agentReference: clean(input.agentReference, 255),
      partnerReference: clean(input.partnerReference, 255),
    };
    if (Object.values(refs).some((value) => !value)) {
      return Response.json({ error: "Reference ของ merchant/branch/business/agent/partner ต้องครบ" }, { status: 400 });
    }

    const relationship = (commercial as any).relationship;
    if (!relationship || relationship.agentReference !== refs.agentReference || relationship.pdReference !== refs.partnerReference) {
      return Response.json({ error: "commercial.relationship ต้องตรงกับ agentReference และ partnerReference" }, { status: 400 });
    }

    await db.prepare(`
      INSERT INTO chatpos_merchant_configs (
        merchant_id, enabled, environment, base_url, credential_env_name, webhook_secret_env_name,
        merchant_reference, branch_reference, business_unit_reference, agent_reference, partner_reference,
        merchant_name, contact_name, phone, email, commercial_json, webhook_callback_url,
        success_redirect_url, failed_redirect_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(merchant_id) DO UPDATE SET
        enabled=excluded.enabled, environment=excluded.environment, base_url=excluded.base_url,
        credential_env_name=excluded.credential_env_name, webhook_secret_env_name=excluded.webhook_secret_env_name,
        merchant_reference=excluded.merchant_reference, branch_reference=excluded.branch_reference,
        business_unit_reference=excluded.business_unit_reference, agent_reference=excluded.agent_reference,
        partner_reference=excluded.partner_reference, merchant_name=excluded.merchant_name,
        contact_name=excluded.contact_name, phone=excluded.phone, email=excluded.email,
        commercial_json=excluded.commercial_json, webhook_callback_url=excluded.webhook_callback_url,
        success_redirect_url=excluded.success_redirect_url, failed_redirect_url=excluded.failed_redirect_url,
        updated_at=CURRENT_TIMESTAMP
    `).bind(
      merchantId,
      input.enabled ? 1 : 0,
      environment,
      baseUrl,
      credentialEnvName,
      webhookSecretEnvName,
      refs.merchantReference,
      refs.branchReference,
      refs.businessUnitReference,
      refs.agentReference,
      refs.partnerReference,
      clean(input.merchantName),
      clean(input.contactName),
      clean(input.phone),
      clean(input.email),
      JSON.stringify(commercial),
      input.webhookCallbackUrl ? clean(input.webhookCallbackUrl, 2048) : null,
      input.successRedirectUrl ? clean(input.successRedirectUrl, 2048) : null,
      input.failedRedirectUrl ? clean(input.failedRedirectUrl, 2048) : null,
    ).run();

    return Response.json({
      success: true,
      merchantId,
      enabled: Boolean(input.enabled),
      webhookReceiver: `/api/chatpos-webhooks/${encodeURIComponent(merchantId)}`,
      note: "ระบบเก็บเฉพาะชื่อ secret binding ไม่เก็บ secret จริงในฐานข้อมูล",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึก config ไม่สำเร็จ" }, { status: 500 });
  }
}
