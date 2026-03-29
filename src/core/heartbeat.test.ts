import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { handleHeartbeat, scheduleHeartbeat, processAllHeartbeats, startLocalScheduler } from "./heartbeat";
import * as dispatcher from "./dispatcher";

describe("Heartbeat System", () => {
    let db: DBClient;

    beforeEach(() => {
        db = new DBClient("sqlite://:memory:");
        const fs = require('fs');
        const path = require('path');
        const migrationSql = fs.readFileSync(path.join(__dirname, '../db/migrations/001_motherboard.sql'), 'utf8');
        db.applyMigration(migrationSql);
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

    it("should schedule a heartbeat correctly", async () => {
        const sessionId = "session-scheduled";
        await scheduleHeartbeat(sessionId, 30, db);

        // Check it was upserted correctly
        const queueCheck = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId) as any[];
        expect(queueCheck.length).toBe(1);
        expect(queueCheck[0].status).toBe('pending');
        expect(queueCheck[0].next_trigger > new Date().toISOString().replace('T', ' ').replace('Z', '')).toBe(true);
    });

    it("should process a specific pending heartbeat via handleHeartbeat", async () => {
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

            await handleHeartbeat(sessionId, db);

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

    it("should do nothing in handleHeartbeat if heartbeat is not pending or due", async () => {
        const sessionId = "session-future";
        const triggerTime = new Date(Date.now() + 10000).toISOString().replace('T', ' ').replace('Z', ''); // future
        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        await handleHeartbeat(sessionId, db);

        // Should still be pending
        const queueCheck = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId) as any[];
        expect(queueCheck.length).toBe(1);
        expect(queueCheck[0].status).toBe('pending');
        expect(queueCheck[0].next_trigger).toBe(triggerTime);
    });

    it("should update heartbeat to error if session has no manifest", async () => {
        const sessionId = "session-missing-manifest";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');

        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        await processAllHeartbeats(db);

        const queueCheck = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId) as any[];
        expect(queueCheck.length).toBe(1);
        expect(queueCheck[0].status).toBe('error');
    });

    it("should update heartbeat to error if session is missing entirely", async () => {
        const sessionId = "non-existent-session";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');

        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        await processAllHeartbeats(db);

        const queueCheck = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId) as any[];
        expect(queueCheck.length).toBe(1);
        expect(queueCheck[0].status).toBe('error');
    });

    it("should process multiple heartbeats correctly even if one fails", async () => {
        const sessionId1 = "session-valid";
        const sessionId2 = "session-invalid";
        const userId = "user-123";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');

        // Valid session
        db.createSession(userId, { prompt: 'do stuff' }, { steps: [], skills_required: [] });
        db.db.run(`UPDATE orchestrator_sessions SET id = ? WHERE user_id = ?`, [sessionId1, userId]);
        if (!db.getGasBalance(userId)) {
            db.incrementGasBalance(userId, 100);
        }
        db.upsertHeartbeat(sessionId1, triggerTime, "pending");

        // Invalid session
        db.upsertHeartbeat(sessionId2, triggerTime, "pending");

        await processAllHeartbeats(db);

        // Check valid session
        const queueCheck1 = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId1) as any[];
        expect(queueCheck1.length).toBe(1);
        expect(queueCheck1[0].status).toBe('pending');
        expect(queueCheck1[0].next_trigger > new Date().toISOString().replace('T', ' ').replace('Z', '')).toBe(true);

        // Check invalid session
        const queueCheck2 = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId2) as any[];
        expect(queueCheck2.length).toBe(1);
        expect(queueCheck2[0].status).toBe('error');
    });

    it("should handle idempotency and prevent double execution", async () => {
        const sessionId = "session-idempotent";
        const userId = "user-123";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');

        db.createSession(userId, { prompt: 'do stuff' }, { steps: [], skills_required: [] });
        db.db.run(`UPDATE orchestrator_sessions SET id = ? WHERE user_id = ?`, [sessionId, userId]);
        db.incrementGasBalance(userId, 100);
        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        // Pretend this heartbeat was already completed
        const idempotencyKey = `heartbeat-${sessionId}-${triggerTime}`;
        db.logTransaction(idempotencyKey, 'completed', {});

        await processAllHeartbeats(db);

        const queueCheck = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId) as any[];
        expect(queueCheck.length).toBe(1);
        expect(queueCheck[0].status).toBe('completed');
    });

    it("should fail heartbeat if gas balance is zero", async () => {
        const sessionId = "session-no-gas";
        const userId = "user-broke";
        const triggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');

        db.createSession(userId, { prompt: 'do stuff' }, { steps: [], skills_required: [] });
        db.db.run(`UPDATE orchestrator_sessions SET id = ? WHERE user_id = ?`, [sessionId, userId]);

        // Ensure user exists but with 0 balance
        db.db.run(`INSERT INTO gas_ledger (id, user_id, balance_credits) VALUES (?, ?, ?)`, [crypto.randomUUID(), userId, 0]);

        db.upsertHeartbeat(sessionId, triggerTime, "pending");

        await processAllHeartbeats(db);

        const queueCheck = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId) as any[];
        expect(queueCheck.length).toBe(1);
        expect(queueCheck[0].status).toBe('failed');
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
