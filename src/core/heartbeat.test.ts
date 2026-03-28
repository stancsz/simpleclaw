import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { scheduleHeartbeat, processPendingHeartbeats, rescheduleHeartbeat } from "./heartbeat";
import { DBClient } from "../db/client";

// Import the real db schema and migrations to initialize the test DB
import fs from "node:fs";

describe("Heartbeat System (Local SQLite)", () => {
    let testDb: DBClient;
    let sessionId: string;

    beforeEach(() => {
        // Initialize an in-memory SQLite database specifically for this test suite
        testDb = new DBClient("sqlite://:memory:");

        // Apply migrations
        const migrationSql = fs.readFileSync("./src/db/migrations/001_motherboard.sql", "utf-8");
        testDb.applyMigration(migrationSql);

        const manifest = { steps: [] };
        sessionId = testDb.createSession("test-user-hb", { test: true }, manifest);
    });

    it("should schedule a heartbeat 30 minutes in the future", async () => {
        await scheduleHeartbeat(sessionId, testDb);

        // We bypass abstraction slightly to verify DB state directly
        const testDbAny = testDb as any;
        const heartbeats = testDbAny.db.query("SELECT * FROM heartbeat_queue").all();

        expect(heartbeats.length).toBe(1);
        expect(heartbeats[0].session_id).toBe(sessionId);

        const scheduledTime = new Date(heartbeats[0].next_trigger).getTime();
        const now = Date.now();
        const diffMs = scheduledTime - now;

        // Ensure ~30 mins diff
        expect(diffMs).toBeGreaterThan(1799000);
        expect(diffMs).toBeLessThan(1801000);

        // Verify audit log
        const auditLogs = testDbAny.db.query("SELECT * FROM audit_log WHERE event = 'continuous_mode_enabled'").all();
        expect(auditLogs.length).toBe(1);
    });

    it("should handle error when processing heartbeat with no manifest", async () => {
        // Schedule one that is due
        const dbAny = testDb as any;
        const hbId = crypto.randomUUID();
        dbAny.db.run(
            `INSERT INTO heartbeat_queue (id, session_id, next_trigger, status) VALUES (?, ?, ?, 'pending')`,
            [hbId, sessionId, new Date(Date.now() - 10000).toISOString().replace('T', ' ').replace('Z', '')]
        );

        // Delete manifest from session
        dbAny.db.run(`UPDATE orchestrator_sessions SET manifest = NULL WHERE id = ?`, [sessionId]);

        await processPendingHeartbeats(testDb);

        const hb = dbAny.db.query("SELECT status FROM heartbeat_queue WHERE id = ?").get(hbId);
        expect(hb.status).toBe("error");
    });

    it("should ensure idempotency and prevent double execution", async () => {
        const dbAny = testDb as any;
        const hbId = crypto.randomUUID();
        dbAny.db.run(
            `INSERT INTO heartbeat_queue (id, session_id, next_trigger, status) VALUES (?, ?, ?, 'pending')`,
            [hbId, sessionId, new Date(Date.now() - 10000).toISOString().replace('T', ' ').replace('Z', '')]
        );

        // Fake idempotency key locked
        const idempotencyKey = `heartbeat_execution_${hbId}`;
        testDb.createTransactionLogEntry(idempotencyKey, 'completed', { fake: true });

        await processPendingHeartbeats(testDb);

        const hb = dbAny.db.query("SELECT status FROM heartbeat_queue WHERE id = ?").get(hbId);
        // It should still be 'pending' because the loop skipped it
        expect(hb.status).toBe("pending");
    });

    it("should reschedule an existing heartbeat", async () => {
        await rescheduleHeartbeat(sessionId, testDb);

        const testDbAny = testDb as any;
        const heartbeats = testDbAny.db.query("SELECT * FROM heartbeat_queue").all();
        expect(heartbeats.length).toBe(1);

        const auditLogs = testDbAny.db.query("SELECT * FROM audit_log WHERE event = 'continuous_mode_rescheduled'").all();
        expect(auditLogs.length).toBe(1);
    });
});
