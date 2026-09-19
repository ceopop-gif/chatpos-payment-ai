CREATE TABLE IF NOT EXISTS chatpos_merchant_configs (
  merchant_id TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  environment TEXT NOT NULL DEFAULT 'test',
  base_url TEXT NOT NULL,
  credential_env_name TEXT NOT NULL,
  webhook_secret_env_name TEXT NOT NULL,
  merchant_reference TEXT NOT NULL,
  branch_reference TEXT NOT NULL,
  business_unit_reference TEXT NOT NULL,
  agent_reference TEXT NOT NULL,
  partner_reference TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  commercial_json TEXT NOT NULL,
  webhook_callback_url TEXT,
  success_redirect_url TEXT,
  failed_redirect_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchant_applications(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS chatpos_merchant_configs_merchant_reference_unique ON chatpos_merchant_configs(merchant_reference);

CREATE TABLE IF NOT EXISTS chatpos_gateway_operations (
  id TEXT PRIMARY KEY NOT NULL,
  merchant_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  client_reference TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  gateway_reference TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_status TEXT,
  provider_code TEXT,
  provider_message TEXT,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchant_applications(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS chatpos_gateway_ops_merchant_client_unique ON chatpos_gateway_operations(merchant_id, operation_type, client_reference);
CREATE UNIQUE INDEX IF NOT EXISTS chatpos_gateway_ops_idempotency_unique ON chatpos_gateway_operations(merchant_id, operation_type, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS chatpos_gateway_ops_gateway_reference_unique ON chatpos_gateway_operations(gateway_reference);
CREATE INDEX IF NOT EXISTS chatpos_gateway_ops_status_idx ON chatpos_gateway_operations(status, updated_at);

CREATE TABLE IF NOT EXISTS chatpos_webhook_inbox (
  id TEXT PRIMARY KEY NOT NULL,
  merchant_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  gateway_reference TEXT,
  processing_state TEXT NOT NULL DEFAULT 'received',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  error_message TEXT,
  FOREIGN KEY (merchant_id) REFERENCES merchant_applications(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS chatpos_webhook_inbox_event_unique ON chatpos_webhook_inbox(environment, merchant_id, event_id);
CREATE INDEX IF NOT EXISTS chatpos_webhook_inbox_state_idx ON chatpos_webhook_inbox(processing_state, received_at);
