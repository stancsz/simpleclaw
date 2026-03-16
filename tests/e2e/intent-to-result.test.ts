import { expect, test, describe, beforeAll, afterAll, mock } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from 'fs';
import * as path from 'path';
import * as ff from '@google-cloud/functions-framework';

// Mock the LLM Intent Parser before importing orchestrator
mock.module("../../src/core/llm", () => ({
    parseIntentToManifest: async (intent: string, availableSkills: string[]) => {
        return {
            version: "1.0",
            intent_parsed: intent,
            skills_required: ["generic-writer", "data-gatherer"],
            credentials_required: ["mock_cred"],
            schedule: null,
            steps: [
                {
                    id: "step_1",
                    description: "Read some initial data",
                    worker: "worker_a",
                    skills: ["data-gatherer"],
                    credentials: ["mock_cred"],
                    depends_on: [],
                    action_type: "READ"
                },
                {
                    id: "step_2",
                    description: "Write a short test message based on data",
                    worker: "worker_b",
                    skills: ["generic-writer"],
                    credentials: ["mock_cred"],
                    depends_on: ["step_1"],
                    action_type: "WRITE"
                }
            ]
        };
    }
}));

import { orchestratorHandler } from "../../src/core/orchestrator";
import { workerHandler } from "../../src/workers/base-worker";
import { DBClient } from "../../src/db/client";
import { SwarmManifest } from "../../src/core/types";

// Helper function to create mock Request and Response objects for Express-like handlers
function createMockReqRes(body: any): { req: ff.Request, res: ff.Response, responseBody: any, statusCode: number } {
    const req = {
        method: 'POST',
        body,
        headers: {},
        query: {},
    } as unknown as ff.Request;

    const result = {
        statusCode: 200,
        responseBody: null as any,
    };

    const res = {
        set: (key: string, value: string) => res,
        status: (code: number) => {
            result.statusCode = code;
            return res;
        },
        json: (data: any) => {
            result.responseBody = data;
        },
        send: (data: any) => {
            result.responseBody = data;
        }
    } as unknown as ff.Response;

    return { req, res, get result() { return result; } };
}

describe("E2E: Intent to Result Loop", () => {
    const testDbPath = 'e2e-test.db';
    const mockSupabaseFile = 'mock-supabase-results.json';
    let dbClient: DBClient;

    beforeAll(() => {
        // Setup SQLite DB
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        if (fs.existsSync(mockSupabaseFile)) {
            fs.unlinkSync(mockSupabaseFile);
        }

        // Set environment variable for the orchestrator
        process.env.DATABASE_URL = `sqlite://${testDbPath}`;

        dbClient = new DBClient(process.env.DATABASE_URL);

        // Apply migration
        const migrationSql = fs.readFileSync(path.join(__dirname, '../../src/db/migrations/001_motherboard.sql'), 'utf-8');
        dbClient.applyMigration(migrationSql);
    });

    afterAll(() => {
        // Cleanup
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        if (fs.existsSync(mockSupabaseFile)) {
            fs.unlinkSync(mockSupabaseFile);
        }
    });

    test("Full loop: Intent -> Parse -> Approve -> Worker -> Results", async () => {
        const userId = "test_user_e2e";
        const intentPrompt = "Test intent e2e";

        // 1. Submit intent to orchestrator
        const orchestratorMock = createMockReqRes({
            prompt: intentPrompt,
            user_id: userId
        });

        await orchestratorHandler(orchestratorMock.req, orchestratorMock.res);

        expect(orchestratorMock.result.statusCode).toBe(200);
        expect(orchestratorMock.result.responseBody.status).toBe('success');
        expect(orchestratorMock.result.responseBody.session_id).toBeDefined();

        const sessionId = orchestratorMock.result.responseBody.session_id;

        // Verify session created in DB
        const session = dbClient.getSession(sessionId);
        expect(session).toBeDefined();
        expect(session.status).toBe('active');
        expect(session.context.prompt).toBe(intentPrompt);

        // Verify manifest structure
        const pda = orchestratorMock.result.responseBody.pda;
        expect(pda.plan.intent_parsed).toBe(intentPrompt);
        expect(pda.plan.steps.length).toBe(2);
        expect(pda.read_operations).toBe(1);
        expect(pda.write_operations).toBe(1);

        // 2. Approve session
        const approveMock = createMockReqRes({
            session_id: sessionId,
            user_id: userId,
            action: "approve"
        });

        await orchestratorHandler(approveMock.req, approveMock.res);

        expect(approveMock.result.statusCode).toBe(200);
        expect(approveMock.result.responseBody.status).toBe('success');

        // Verify session status updated in DB
        const updatedSession = dbClient.getSession(sessionId);
        expect(updatedSession.status).toBe('approved');

        // Verify Audit Log for Plan Approved
        const rawDb = new Database(testDbPath);
        const approveAudit = rawDb.query(`SELECT * FROM audit_log WHERE session_id = ? AND event = 'plan_approved'`).get(sessionId) as any;
        expect(approveAudit).toBeDefined();

        // 3. Dispatch workers in DAG order
        const executedTasks: string[] = [];
        const executeTask = async (taskId: string) => {
            const task = pda.plan.steps.find((s: any) => s.id === taskId);
            if (!task) return;

            // Check dependencies
            for (const dep of task.depends_on) {
                if (!executedTasks.includes(dep)) {
                    throw new Error(`Dependency ${dep} not executed before ${taskId}`);
                }
            }

            const workerMock = createMockReqRes({
                session_id: sessionId,
                task: task.id,
                skills: task.skills,
                credentials: task.credentials
            });

            await workerHandler(workerMock.req, workerMock.res);
            expect(workerMock.result.statusCode).toBe(200);
            expect(workerMock.result.responseBody.status).toBe('success');

            executedTasks.push(taskId);
        };

        // Execution order must respect DAG
        await executeTask("step_1");
        await executeTask("step_2");

        expect(executedTasks).toEqual(["step_1", "step_2"]);

        // 4. Verify results are written to DB `task_results` table
        const results = rawDb.query(`SELECT * FROM task_results WHERE session_id = ? ORDER BY created_at ASC`).all(sessionId) as any[];
        expect(results.length).toBe(2);

        expect(results[0].session_id).toBe(sessionId);
        expect(results[0].skill_ref).toBe("step_1");
        expect(results[0].status).toBe('success');

        expect(results[1].session_id).toBe(sessionId);
        expect(results[1].skill_ref).toBe("step_2");
        expect(results[1].status).toBe('success');

        rawDb.close();
    });
});
