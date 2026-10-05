CREATE TABLE IF NOT EXISTS stoppay_lookups (
  token TEXT PRIMARY KEY NOT NULL,
  operation_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  slip_reference TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS stoppay_lookups_expiry_idx ON stoppay_lookups(expires_at);

CREATE TABLE IF NOT EXISTS stoppay_otp_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  lookup_token TEXT NOT NULL,
  phone TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  otp_id TEXT NOT NULL,
  reference_code TEXT,
  verified_at TEXT,
  expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS stoppay_otp_phone_created_idx ON stoppay_otp_sessions(phone, created_at);

CREATE TABLE IF NOT EXISTS stoppay_cases (
  id TEXT PRIMARY KEY NOT NULL,
  case_number TEXT NOT NULL UNIQUE,
  operation_id TEXT NOT NULL UNIQUE,
  gateway_reference TEXT,
  merchant_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  slip_object_key TEXT,
  slip_reference TEXT,
  reporter_name TEXT NOT NULL,
  reporter_phone TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  reason_detail TEXT NOT NULL DEFAULT '',
  declaration_accepted INTEGER NOT NULL DEFAULT 0,
  otp_verified_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'merchant_action_required',
  merchant_contact_deadline TEXT NOT NULL,
  merchant_contacted_at TEXT,
  merchant_response_note TEXT NOT NULL DEFAULT '',
  hold_requested_at TEXT,
  refund_review_requested_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS stoppay_cases_merchant_status_idx ON stoppay_cases(merchant_id, status, created_at);
CREATE INDEX IF NOT EXISTS stoppay_cases_deadline_idx ON stoppay_cases(status, merchant_contact_deadline);

CREATE TABLE IF NOT EXISTS stoppay_events (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS stoppay_events_case_created_idx ON stoppay_events(case_id, created_at);
