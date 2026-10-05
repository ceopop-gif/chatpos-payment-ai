CREATE TABLE IF NOT EXISTS stoppay_identity_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  otp_id TEXT NOT NULL,
  reference_code TEXT,
  verified_at TEXT,
  expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS stoppay_identity_phone_created_idx
  ON stoppay_identity_sessions(phone, created_at);
