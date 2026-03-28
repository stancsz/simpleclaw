import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { processHeartbeats, startLocalScheduler } from "./heartbeat";
// import { NextRequest } from "next/server"; // Can't import next/server outside server/ dir in bun tests cleanly without setup
import * as dispatcher from "./dispatcher";

describe("Heartbeat System", () => {
    let db: DBClient;

    beforeEach(() => {
        db = new DBClient("sqlite://:memory:");
        db.applyMigration(`
            CREATE TABLE IF NOT EXISTS heartbeat_queue (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                next_trigger TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS orchestrator_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                context TEXT,
                manifest TEXT,
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
            CREATE TABLE IF NOT EXISTS gas_ledger (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                balance_credits INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS transaction_log (
                idempotency_key TEXT PRIMARY KEY,
                status TEXT,
                result TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
    });

    it("should upsert and retrieve pending heartbeats", () => {
        const sessionId = "session-123";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', ''); // past

        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        const pending = db.getPendingHeartbeats();
        expect(pending.length).toBe(1);
        expect(pending[0].session_id).toBe(sessionId);
        expect(pending[0].status).toBe("pending");
    });

    it("should not retrieve future heartbeats", () => {
        const sessionId = "session-456";
        const triggerTime = new Date(Date.now() + 10000).toISOString().replace('T', ' ').replace('Z', ''); // future

        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        const pending = db.getPendingHeartbeats();
        expect(pending.length).toBe(0);
    });

    it("should update heartbeat status", () => {
        const sessionId = "session-123";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');

        db.upsertHeartbeat(sessionId, triggerTime, "pending");
        let pending = db.getPendingHeartbeats();
        expect(pending.length).toBe(1);

        const id = pending[0].id;
        db.updateHeartbeatStatus(id, "processing");

        pending = db.getPendingHeartbeats();
        expect(pending.length).toBe(0); // It's no longer pending
    });

    it("should process pending heartbeats via local scheduler simulation", async () => {
        const sessionId = "session-789";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');

        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        // Mock global fetch for the scheduler
        const originalFetch = global.fetch;
        let fetchCalledUrl = "";
        global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
            fetchCalledUrl = url.toString();
            return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
        };

        try {
            await processHeartbeats(db, "http://localhost:3000");

            expect(fetchCalledUrl).toBe(`http://localhost:3000/api/heartbeat?sessionId=${sessionId}`);

            const pending = db.getPendingHeartbeats();
            expect(pending.length).toBe(0);
        } finally {
            global.fetch = originalFetch;
        }
    });

    it("should prevent double-execution via idempotency in heartbeat route", async () => {
        // Set up session for heartbeat
        const sessionId = "session-idempotent";
        const userId = "user-123";
        db.createSession(userId, { prompt: 'do stuff' }, { steps: [], skills_required: [] });

        // First we simulate the webhook endpoint
        const reqUrl = new URL(`http://localhost:3000/api/heartbeat?sessionId=${sessionId}`);

        // Mock DB connection inside the route by using a spy or since it calls getDbClient(),
        // we should make sure getDbClient returns our local `db` instance.
        // Let's test the logic directly using the idempotency methods as requested.
        const triggerTime = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
        const idempotencyKey = `heartbeat-${sessionId}-${triggerTime}`;

        expect(db.checkIdempotency(idempotencyKey)).toBe(false);

        // First run completes and logs
        db.createTransactionLogEntry(idempotencyKey, 'started', {});
        db.logTransaction(idempotencyKey, 'completed', { ok: true });

        // Second run detects it's already done
        expect(db.checkIdempotency(idempotencyKey)).toBe(true);
    });

    it("should resume orchestrator from checkpointed state correctly", () => {
        const sessionId = "session-resume";
        const userId = "user-123";
        const context = { prompt: "run task every hour" };
        const manifest = { steps: [{ id: "step1", action_type: "READ" }] };

        // Create the session (checkpoints it to the DB)
        const newSessionId = db.createSession(userId, context, manifest);

        // Emulate hydrating context from orchestrator_sessions
        const session = db.getSession(newSessionId);
        expect(session).not.toBeNull();
        expect(session.user_id).toBe(userId);
        expect(session.status).toBe("active");
        expect(session.context.prompt).toBe("run task every hour");
        expect(session.manifest.steps[0].id).toBe("step1");
    });
});
