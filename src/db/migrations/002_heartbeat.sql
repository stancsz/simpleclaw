CREATE TABLE IF NOT EXISTS heartbeat_queue (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    next_trigger TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
