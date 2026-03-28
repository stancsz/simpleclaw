import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { handleHeartbeat, startLocalScheduler } from "./heartbeat";
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
        const userId = "user-123";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');

        db.createSession(userId, { prompt: 'do stuff' }, { steps: [], skills_required: [] });
        // Override session ID for the test since createSession uses crypto.randomUUID
        db.db.run(`UPDATE orchestrator_sessions SET id = ? WHERE user_id = ?`, [sessionId, userId]);

        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        // Let it call the real executeSwarmManifest but mock the DB gas lookup to bypass error,
        // and let it complete. Wait, executeSwarmManifest relies on manifest logic.
        // If manifest is empty list, it completes instantly with success.

        try {
            // Need to insert some gas balance so executeSwarmManifest doesn't fail early
            if (!db.getGasBalance(userId)) {
                db.incrementGasBalance(userId, 100);
            }

            await handleHeartbeat(db);

            // handleHeartbeat updates the queue to 'completed' AND queues the next one as 'pending'
            // We should find one 'completed' (which getPendingHeartbeats ignores) and one new 'pending'
            const pending = db.getPendingHeartbeats();
            expect(pending.length).toBe(0); // the new one is 30 mins in future!

            const queueCheck = db.db.query("SELECT * FROM heartbeat_queue").all() as any[];
            expect(queueCheck.length).toBe(1);
            expect(queueCheck[0].status).toBe('pending');
            expect(queueCheck[0].next_trigger > new Date().toISOString().replace('T', ' ').replace('Z', '')).toBe(true);
        } finally {

        }
    });

    it("should update heartbeat to error if session has no manifest", async () => {
        const sessionId = "session-missing-manifest";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');

        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        await handleHeartbeat(db);

        const queueCheck = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId) as any[];
        expect(queueCheck.length).toBe(1);
        expect(queueCheck[0].status).toBe('error');
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
