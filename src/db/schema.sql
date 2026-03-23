-- Secrets vault (managed by Supabase pgsodium)
CREATE TABLE vault.user_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,            -- e.g., 'openai_key', 'shopify_token'
    secret TEXT NOT NULL,          -- Encrypted by pgsodium automatically
    provider TEXT,                 -- 'openai' | 'gemini' | 'deepseek' | 'shopify' | ...
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session / Orchestrator state
CREATE TABLE orchestrator_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    status TEXT DEFAULT 'active',  -- 'active' | 'waiting_approval' | 'running' | 'complete'
    context JSONB,                 -- Hydrated LLM context
    manifest JSONB,                -- The swarm.yaml as structured JSON
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task results from Workers
CREATE TABLE task_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES orchestrator_sessions(id),
    worker_id TEXT,
    skill_ref TEXT,
    status TEXT,                   -- 'success' | 'error' | 'skipped'
    output JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable audit log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID,
    event TEXT,                    -- 'intent_received' | 'plan_approved' | 'worker_dispatched' | ...
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency guard
CREATE TABLE transaction_log (
    idempotency_key TEXT PRIMARY KEY,
    status TEXT,
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Heartbeat queue (for Continuous Mode)
CREATE TABLE heartbeat_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID,
    next_trigger TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gas ledger (credit balance)
CREATE TABLE gas_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    balance_credits BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skill references
CREATE TABLE skill_refs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    skill_name TEXT NOT NULL,
    source TEXT,                   -- 'platform' | 'github' | 'upload'
    ref TEXT,                      -- URL or file path
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE SCHEMA IF NOT EXISTS swarms;

CREATE OR REPLACE FUNCTION swarms.verify_motherboard_integrity()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_missing_tables TEXT[] := '{}';
    v_required_tables TEXT[] := ARRAY[
        'orchestrator_sessions',
        'task_results',
        'audit_log',
        'transaction_log',
        'heartbeat_queue',
        'gas_ledger',
        'skill_refs'
    ];
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY v_required_tables
    LOOP
        IF NOT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = v_table
        ) THEN
            v_missing_tables := array_append(v_missing_tables, v_table);
        END IF;
    END LOOP;

    -- Also check vault.user_secrets
    IF NOT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'vault'
        AND table_name = 'user_secrets'
    ) THEN
        v_missing_tables := array_append(v_missing_tables, 'vault.user_secrets');
    END IF;

    IF array_length(v_missing_tables, 1) > 0 THEN
        RETURN jsonb_build_object('status', 'error', 'version', '1.0', 'missing_tables', v_missing_tables);
    END IF;

    RETURN jsonb_build_object('status', 'ok', 'version', '1.0', 'missing_tables', '[]');
END;
$$;

CREATE OR REPLACE FUNCTION swarms.read_secret(p_secret_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs as DB owner, not calling role
AS $$
DECLARE
    v_decrypted TEXT;
BEGIN
    -- Verify caller is the platform's service role
    IF current_setting('role') != 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT decrypted_secret
    INTO v_decrypted
    FROM vault.decrypted_secrets
    WHERE id = p_secret_id;

    -- Log the access
    INSERT INTO audit_log(event, metadata)
    VALUES ('secret_accessed', jsonb_build_object('secret_id', p_secret_id, 'timestamp', NOW()));

    RETURN v_decrypted;
END;
$$;
