CREATE TABLE IF NOT EXISTS kyc_edit_permissions (
  merchant_id TEXT PRIMARY KEY NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 0,
  allowed_by TEXT,
  allowed_at TEXT,
  revoked_at TEXT,
  consumed_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchant_applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS kyc_edit_permissions_allowed_idx
  ON kyc_edit_permissions(allowed, updated_at);
