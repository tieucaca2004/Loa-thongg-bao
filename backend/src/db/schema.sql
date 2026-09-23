-- Normalized transaction model (see docs/ARCHITECTURE.md #5).
-- transaction_id has a UNIQUE constraint so the same provider transaction
-- can never be stored twice, regardless of how many times the webhook fires.
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,                -- our own UUID
  provider TEXT NOT NULL,             -- e.g. 'sepay'
  gateway TEXT NOT NULL,              -- e.g. 'MBBank'
  transaction_id TEXT NOT NULL UNIQUE,-- provider's unique transaction id (idempotency key)
  reference_code TEXT,
  account_number TEXT,
  amount INTEGER NOT NULL,            -- VND, integer, no decimals
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('in', 'out')),
  content TEXT,
  transaction_date TEXT,              -- ISO 8601 string as reported by provider
  received_at TEXT NOT NULL,          -- ISO 8601, when our webhook received it
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'announced', 'error')),
  raw_payload TEXT NOT NULL,          -- full original JSON body, for audit/reconciliation
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_received_at ON transactions (received_at);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);

-- Every webhook delivery attempt is logged (even duplicates/rejections) for
-- debugging and reconciliation, independent of whether a transaction row
-- was created.
CREATE TABLE IF NOT EXISTS webhook_logs (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'duplicate', 'rejected_invalid', 'rejected_auth')),
  reason TEXT,
  transaction_id TEXT,                -- provider transaction id, if parseable
  raw_payload TEXT NOT NULL,
  source_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON webhook_logs (received_at);
