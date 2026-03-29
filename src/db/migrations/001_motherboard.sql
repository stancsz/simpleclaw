-- SQLite migration for SimpleClaw local development
-- This simulates the Supabase Sovereign Motherboard locally

CREATE TABLE IF NOT EXISTS vault_user_secrets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    secret TEXT NOT NULL,
    provider TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orchestrator_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    context TEXT,
    manifest TEXT,
    continuous_mode INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_results (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES orchestrator_sessions(id),
    worker_id TEXT,
    skill_ref TEXT,
    status TEXT,
    output TEXT,
    error TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    event TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transaction_log (
    idempotency_key TEXT PRIMARY KEY,
    status TEXT,
    result TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS heartbeat_queue (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    next_trigger TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gas_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    balance_credits INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skill_refs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    source TEXT,
    ref TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_users (
    user_id TEXT PRIMARY KEY,
    supabase_url TEXT NOT NULL,
    encrypted_service_role TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
