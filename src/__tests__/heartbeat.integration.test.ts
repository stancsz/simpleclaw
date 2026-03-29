import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { scheduleHeartbeat, processHeartbeat, handleHeartbeat } from "../core/heartbeat";
import { SwarmManifest } from "../core/types";

describe("Heartbeat Integration", () => {
    let db: DBClient;

    beforeEach(() => {
        db = new DBClient("sqlite://:memory:");

        // Load the actual production migration file to ensure we're testing the real schema
        const fs = require('fs');
        const path = require('path');
        const migrationSql = fs.readFileSync(path.join(__dirname, '../db/migrations/001_motherboard.sql'), 'utf8');
        db.applyMigration(migrationSql);
    });

    afterEach(() => {
        // Cleanup resources
    });

    it("should successfully run a recurring heartbeat session end-to-end", async () => {
        const userId = "user-heartbeat-123";
        const sessionId = "session-heartbeat-123";

        // Create the session
        const manifest: SwarmManifest = {
            version: "1.0",
            skills_required: ["test-skill"],
            schedule: "0 2 * * *",
            steps: [
                {
                    id: "step1",
                    worker: "test-skill-worker",
                    skill_ref: "test-skill",
                    action_type: "READ",
                    objective: "read some dummy data",
                    parameters: {},
                    depends_on: []
                }
            ]
        };

        db.createSession(userId, { prompt: 'do recurring task' }, manifest);
        db.db.run(`UPDATE orchestrator_sessions SET id = ? WHERE user_id = ?`, [sessionId, userId]);

        // Add gas credits
        db.incrementGasBalance(userId, 100);

        // Schedule the initial heartbeat (simulate the orchestrator approving the plan)
        await scheduleHeartbeat(sessionId, 30, db);

        // Update the heartbeat to be in the past so it gets picked up
        const pastTriggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');
        db.db.run(`UPDATE heartbeat_queue SET next_trigger = ? WHERE session_id = ?`, [pastTriggerTime, sessionId]);

        // Mock skill dependencies and available execution
        // We know executeSwarmManifest uses executeWorkerTask
        // But since this is a real integration test and "test-skill" isn't a core/loaded skill,
        // wait, let's use a mock worker that we know exists like mock-skill or echo
        manifest.skills_required = ["mock-skill"];
        manifest.steps[0].worker = "mock-worker";
        manifest.steps[0].skill_ref = "mock-skill";
        db.db.run(`UPDATE orchestrator_sessions SET manifest = ? WHERE id = ?`, [JSON.stringify(manifest), sessionId]);

        // Actually the executeWorkerTask will call the opencode worker or github worker, let's just make sure it does not fail the execution badly
        // Or we can just use processHeartbeat and check the queue states

        await handleHeartbeat(db);

        // It should have completed the heartbeat and scheduled a new one
        const allHeartbeats = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ? ORDER BY created_at DESC").all(sessionId) as any[];

        // Either 1 updated heartbeat, or 2 heartbeats
        // DB upsert uses UPDATE if session_id exists
        expect(allHeartbeats.length).toBe(1);
        expect(allHeartbeats[0].status).toBe('pending');

        // Check the new trigger time is in the future
        expect(allHeartbeats[0].next_trigger > pastTriggerTime).toBe(true);
        expect(allHeartbeats[0].next_trigger > new Date().toISOString().replace('T', ' ').replace('Z', '')).toBe(true);

        // And it should have used gas
        // They start with 10 free credits when DB calls getGasBalance internally, plus 100 added manually
        // After 1 run, they should have 109 credits
        const balance = db.getGasBalance(userId);
        expect(balance).toBe(109);

        // There should be a log indicating completion
        const logs = db.getAuditLogs(sessionId);
        const hasTriggerLog = logs.some((l: any) => l.event === "heartbeat_triggered");
        expect(hasTriggerLog).toBe(true);
    });

    it("should suspend continuous mode if gas is exhausted", async () => {
        const userId = "user-heartbeat-broke";
        const sessionId = "session-heartbeat-broke";

        const manifest: SwarmManifest = {
            version: "1.0",
            skills_required: ["test-skill"],
            schedule: "0 2 * * *",
            steps: []
        };

        db.createSession(userId, { prompt: 'do recurring task' }, manifest);
        db.db.run(`UPDATE orchestrator_sessions SET id = ? WHERE user_id = ?`, [sessionId, userId]);

        // User starts with 10 free credits when DB calls getGasBalance on insert
        // Override back to 0
        db.db.run(`DELETE FROM gas_ledger WHERE user_id = ?`, [userId]);
        db.db.run(`INSERT INTO gas_ledger (id, user_id, balance_credits) VALUES (?, ?, ?)`, ["some-id-gas", userId, 0]);

        await scheduleHeartbeat(sessionId, 30, db);
        const pastTriggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');
        db.db.run(`UPDATE heartbeat_queue SET next_trigger = ? WHERE session_id = ?`, [pastTriggerTime, sessionId]);

        await handleHeartbeat(db);

        // Should be failed
        const allHeartbeats = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId) as any[];
        expect(allHeartbeats.length).toBe(1);
        expect(allHeartbeats[0].status).toBe('failed');

        // Check logs for suspend event
        const logs = db.getAuditLogs(sessionId);
        const hasSuspendLog = logs.some((l: any) => l.event === "continuous_mode_suspended");
        expect(hasSuspendLog).toBe(true);
    });

    it("should correctly test idempotency to prevent double-billing", async () => {
        const userId = "user-idempotent-123";
        const sessionId = "session-idempotent-123";

        const manifest: SwarmManifest = {
            version: "1.0",
            skills_required: [],
            schedule: "0 2 * * *",
            steps: []
        };

        db.createSession(userId, { prompt: 'do recurring task' }, manifest);
        db.db.run(`UPDATE orchestrator_sessions SET id = ? WHERE user_id = ?`, [sessionId, userId]);

        db.incrementGasBalance(userId, 100);

        await scheduleHeartbeat(sessionId, 30, db);
        const pastTriggerTime = new Date(Date.now() - 1000).toISOString().replace('T', ' ').replace('Z', '');
        db.db.run(`UPDATE heartbeat_queue SET next_trigger = ? WHERE session_id = ?`, [pastTriggerTime, sessionId]);

        // Find the exact heartbeat queue item
        const hq = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").get(sessionId) as any;

        // Create idempotency lock first to simulate a concurrent run
        const idempotencyKey = `heartbeat-${hq.session_id}-${hq.next_trigger}`;
        db.logTransaction(idempotencyKey, 'completed', {});

        await handleHeartbeat(db);

        const allHeartbeats = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ?").all(sessionId) as any[];

        // The heartbeat should be marked completed but NO next one scheduled
        // Because the idempotency check bails out before scheduling
        expect(allHeartbeats.length).toBe(1);
        expect(allHeartbeats[0].status).toBe('completed');
        expect(allHeartbeats[0].next_trigger).toBe(pastTriggerTime);

        // Gas balance should be 110 (10 free + 100 increment), none deducted!
        const balance = db.getGasBalance(userId);
        expect(balance).toBe(110);
    });
});
