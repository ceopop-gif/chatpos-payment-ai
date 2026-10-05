CREATE TABLE IF NOT EXISTS otp_bypass_phones (
  phone TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT NOT NULL DEFAULT '',
  cancelled_by TEXT,
  cancelled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chatposhub_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  default_daily_limit_cents INTEGER NOT NULL DEFAULT 5000000,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chatposhub_group_members (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  daily_limit_cents INTEGER NOT NULL DEFAULT 5000000,
  status TEXT NOT NULL DEFAULT 'active',
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_by TEXT,
  removed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS chatposhub_group_member_active_phone_unique
  ON chatposhub_group_members(phone)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS chatposhub_group_member_group_status_idx
  ON chatposhub_group_members(group_id, status, added_at);

CREATE INDEX IF NOT EXISTS chatposhub_group_member_merchant_idx
  ON chatposhub_group_members(merchant_id, status);

CREATE TABLE IF NOT EXISTS chatposhub_audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT,
  merchant_id TEXT,
  phone TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS chatposhub_audit_group_created_idx
  ON chatposhub_audit_logs(group_id, created_at);
