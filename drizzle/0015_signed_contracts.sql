CREATE TABLE IF NOT EXISTS merchant_signed_contracts (
  id TEXT PRIMARY KEY NOT NULL,
  merchant_id TEXT NOT NULL REFERENCES merchant_applications(id),
  shop_name TEXT NOT NULL,
  signer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  contract_text TEXT NOT NULL,
  signature_data TEXT NOT NULL CHECK (length(signature_data) > 0),
  signed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS signed_contracts_date ON merchant_signed_contracts(signed_at DESC, id);
CREATE INDEX IF NOT EXISTS signed_contracts_merchant ON merchant_signed_contracts(merchant_id);
