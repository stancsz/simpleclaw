import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { DBClient } from "../db/client";
import { processHeartbeats } from "./scheduler";
import { NextRequest } from "next/server";
import { POST as heartbeatRoute } from "../../server/src/app/api/heartbeat/route";
import * as dispatcher from "./dispatcher";

describe("Heartbeat System", () => {
    let db: DBClient;

    beforeEach(() => {
        db = new DBClient("sqlite://:memory:");
        db.applyMigration(`
            CREATE TABLE heartbeat_queue (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                next_trigger TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE orchestrator_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                context TEXT,
                manifest TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE task_results (
                id TEXT PRIMARY KEY,
                session_id TEXT REFERENCES orchestrator_sessions(id),
                worker_id TEXT,
                skill_ref TEXT,
                status TEXT,
                output TEXT,
                error TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE audit_log (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                event TEXT,
                metadata TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE gas_ledger (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                balance_credits INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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

});
