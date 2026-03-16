import { expect, test, describe, beforeAll, afterAll, mock } from "bun:test";
import { DBClient } from "../../src/db/client";
import { Database } from "bun:sqlite";
import * as fs from 'fs';
import * as path from 'path';

// Mock the LLM call before importing orchestrator
import * as llmModule from "../../src/core/llm";
import { SwarmManifest } from "../../src/core/types";

const mockManifest: SwarmManifest = {
    version: "1.0",
    intent_parsed: "Test intent to read and write",
    skills_required: ["generic-writer"],
    credentials_required: ["test_cred"],
    schedule: null,
    steps: [
        {
            id: "step_1",
            description: "Read data",
            worker: "worker_a",
            skills: ["generic-writer"],
            credentials: ["test_cred"],
            depends_on: [],
            action_type: "READ"
        },
        {
            id: "step_2",
            description: "Write data",
            worker: "worker_b",
            skills: ["generic-writer"],
            credentials: ["test_cred"],
            depends_on: ["step_1"],
            action_type: "WRITE"
        }
    ]
};

mock.module("../../src/core/llm", () => ({
    parseIntentToManifest: async () => mockManifest
}));

import { orchestratorHandler } from "../../src/core/orchestrator";
import { workerHandler } from "../../src/workers/base-worker";

describe("E2E Integration: Intent to Result", () => {
    let dbClient: DBClient;
    const testDbPath = 'e2e-test.db';
    const mockSupabaseFile = 'mock-supabase-results.json';

    beforeAll(() => {
        // Ensure clean slate
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        if (fs.existsSync(mockSupabaseFile)) fs.unlinkSync(mockSupabaseFile);

        // Override env vars
        process.env.DATABASE_URL = `sqlite://${testDbPath}`;

        // Initialize client and apply migration
        dbClient = new DBClient(process.env.DATABASE_URL);
        const migrationSql = fs.readFileSync(path.join(__dirname, '../../src/db/migrations/001_motherboard.sql'), 'utf-8');
        dbClient.applyMigration(migrationSql);
    });

    afterAll(() => {
        // Cleanup
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        if (fs.existsSync(mockSupabaseFile)) fs.unlinkSync(mockSupabaseFile);
    });

    test("Full E2E Flow: Intent -> Parse -> Plan -> Approve -> Dispatch -> Result", async () => {
        const startTime = Date.now();

        // 1. Simulate Intent to Orchestrator
        let orchestratorStatus = 0;
        let orchestratorBody: any = null;

        const reqOrchestrator = {
            method: 'POST',
            body: {
                prompt: "Please test the system",
                user_id: "e2e_user_123"
            }
        } as any;

        const resOrchestrator = {
            set: () => {},
            status: (code: number) => {
                orchestratorStatus = code;
                return {
                    json: (data: any) => { orchestratorBody = data; }
                };
            }
        } as any;

        await orchestratorHandler(reqOrchestrator, resOrchestrator);

        // Assert Orchestrator Success
        expect(orchestratorStatus).toBe(200);
        expect(orchestratorBody.status).toBe('success');
        expect(orchestratorBody.session_id).toBeDefined();

        const sessionId = orchestratorBody.session_id;
        const pda = orchestratorBody.pda;
        expect(pda.plan.steps.length).toBe(2);
        expect(pda.status).toBe('waiting_approval');

        // 2. Simulate Approval
        let approveStatus = 0;
        let approveBody: any = null;

        const reqApprove = {
            method: 'POST',
            body: {
                user_id: "e2e_user_123",
                session_id: sessionId,
                action: 'approve'
            }
        } as any;

        const resApprove = {
            set: () => {},
            status: (code: number) => {
                approveStatus = code;
                return {
                    json: (data: any) => { approveBody = data; }
                };
            }
        } as any;

        await orchestratorHandler(reqApprove, resApprove);

        // Assert Approval Success
        expect(approveStatus).toBe(200);
        expect(approveBody.status).toBe('success');

        // Check DB that status is approved
        const session = dbClient.getSession(sessionId);
        expect(session.status).toBe('approved');

        // Check audit log for plan_approved
        const rawDb = new Database(testDbPath);
        const auditLogApproved = rawDb.query(`SELECT * FROM audit_log WHERE session_id = ? AND event = 'plan_approved'`).get(sessionId);
        expect(auditLogApproved).not.toBeNull();
        rawDb.close();

        // 3. Simulate Worker Dispatch
        const tasks = pda.plan.steps;
        const workerResults = [];

        for (const task of tasks) {
            let workerStatus = 0;
            let workerBody: any = null;

            const reqWorker = {
                method: 'POST',
                body: {
                    session_id: sessionId,
                    task: task.description,
                    skills: task.skills,
                    credentials: task.credentials
                }
            } as any;

            const resWorker = {
                set: () => {},
                status: (code: number) => {
                    workerStatus = code;
                    return {
                        json: (data: any) => { workerBody = data; }
                    };
                }
            } as any;

            await workerHandler(reqWorker, resWorker);

            expect(workerStatus).toBe(200);
            expect(workerBody.status).toBe('success');
            expect(workerBody.result).toBeDefined();
            workerResults.push(workerBody.result);
        }

        expect(workerResults.length).toBe(2);

        // 4. Verify Results are written to mock-supabase-results.json
        expect(fs.existsSync(mockSupabaseFile)).toBe(true);
        const resultsJson = JSON.parse(fs.readFileSync(mockSupabaseFile, 'utf8'));

        expect(resultsJson.length).toBe(2);
        expect(resultsJson[0].session_id).toBe(sessionId);
        expect(resultsJson[0].task).toBe("Read data");
        expect(resultsJson[0].status).toBe('success');

        expect(resultsJson[1].session_id).toBe(sessionId);
        expect(resultsJson[1].task).toBe("Write data");
        expect(resultsJson[1].status).toBe('success');

        // 5. Ensure time < 10 seconds
        const endTime = Date.now();
        const duration = endTime - startTime;
        expect(duration).toBeLessThan(10000); // 10 seconds
    });
});
