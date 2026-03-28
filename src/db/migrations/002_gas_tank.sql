-- Gas ledger already exists in 001_motherboard.sql, but keeping this migration file
-- to ensure the table schema is explicitly declared as part of the gas tank feature rollout.

CREATE TABLE IF NOT EXISTS gas_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    balance_credits INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);