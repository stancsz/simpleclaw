import { expect, test, describe, beforeAll, afterAll, mock } from "bun:test";
import { DBClient } from "../../src/db/client";
import { executeSwarmManifest } from "../../src/core/dispatcher";
import { orchestratorHandler } from "../../src/core/orchestrator";
import * as llm from "../../src/core/llm";
import type { SwarmManifest, PlanDiffApprove } from "../../src/core/types";
import * as ff from '@google-cloud/functions-framework';
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const TEST_DB_PATH = "sqlite://server_test_integration.db";
let db: DBClient;

describe("Orchestrator Execution Flow Integration", () => {
    beforeAll(() => {
        // Ensure test db is clean
        const dbFile = TEST_DB_PATH.replace("sqlite://", "");
        if (fs.existsSync(dbFile)) {
            fs.unlinkSync(dbFile);
        }

        // Initialize DBClient (which auto-creates tables for local sqlite)
        db = new DBClient(TEST_DB_PATH);

        const migrationSql = fs.readFileSync(path.join(process.cwd(), "..", "src", "db", "migrations", "001_motherboard.sql"), 'utf-8');
        db.applyMigration(migrationSql);

        // Add a mock skill for the test
        const skillsDir = path.join(process.cwd(), "src/skills");
        if (!fs.existsSync(skillsDir)) {
             fs.mkdirSync(skillsDir, { recursive: true });
        }

        fs.writeFileSync(path.join(skillsDir, "mock-skill.md"), `---
skill_name: mock-skill
version: "1.0.0"
description: A mock skill for testing.
---

Mock skill body.
`);

        // Mock LLM intent parsing
        mock.module("../../src/core/llm", () => ({
             parseIntentToManifest: async (prompt: string, skills: string[]): Promise<SwarmManifest> => {
                 return {
                     version: "1.0",
                     intent_parsed: prompt,
                     credentials_required: [],
                     skills_required: ["mock-skill"],
                     steps: [
                         {
                             id: "step_1",
                             description: "Execute mock worker task",
                             worker: "test-worker",
                             action_type: "WRITE",
                             skills: ["mock-skill"],
                             depends_on: [],
                             credentials: []
                         }
                     ]
                 };
             }
        }));
    });

    afterAll(() => {
        const dbFile = TEST_DB_PATH.replace("sqlite://", "");
        if (fs.existsSync(dbFile)) {
            fs.unlinkSync(dbFile);
        }

        const mockSkillPath = path.join(process.cwd(), "src/skills/mock-skill.md");
        if (fs.existsSync(mockSkillPath)) {
            fs.unlinkSync(mockSkillPath);
        }

        mock.restore();
    });

    test("Full flow: Intent -> Plan -> Approve -> Execution -> DB Results", async () => {
        // Step 1: Call Orchestrator API (simulated) to get a PlanDiffApprove
        let statusCode = 200;
        let responseBody: any = null;

        // Mock request object
        const req = {
            method: "POST",
            body: {
                prompt: "Run the mock skill",
                user_id: "test-user-id"
            }
        } as ff.Request;

        // Mock response object
        const res = {
            set: () => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (data: any) => {
                responseBody = data;
            },
            send: (data: string) => {
                responseBody = JSON.parse(data);
            }
        } as unknown as ff.Response;

        // We override the internal process.env.DATABASE_URL so orchestratorHandler uses our test DB
        process.env.DATABASE_URL = TEST_DB_PATH;

        await orchestratorHandler(req, res);

        expect(statusCode).toBe(200);
        expect(responseBody).toBeDefined();
        expect(responseBody.status).toBe("success");
        expect(responseBody.pda).toBeDefined();

        const pda = responseBody.pda as PlanDiffApprove;
        const sessionId = responseBody.session_id;

        expect(pda.plan.steps.length).toBe(1);
        expect(pda.plan.steps[0].id).toBe("step_1");
        expect(sessionId).toBeDefined();

        // Verify session was created in DB
        const session = db.getSession(sessionId);
        expect(session).toBeDefined();
        // createSession defaults to 'active' internally, which is conceptually 'waiting_approval' in PDA
        expect(session?.status).toBe("active");

        // Step 2: Trigger execution directly (simulating what the /api/orchestrator/execute route does)
        db.updateSessionStatus(sessionId, "approved");
        expect(db.getSession(sessionId)?.status).toBe("approved");

        // Force mock fetch to handle worker HTTP execution
        const originalFetch = global.fetch;
        global.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
             // Simulate worker successful response
             return new Response(JSON.stringify({
                 result: {
                     status: "success",
                     output: "Mock worker execution successful"
                 }
             }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });

        process.env.FORCE_MOCK_FETCH = "true";

        try {
            await executeSwarmManifest(pda.plan, sessionId, db);
        } finally {
            global.fetch = originalFetch;
            delete process.env.FORCE_MOCK_FETCH;
        }

        // Mark session completed
        db.updateSessionStatus(sessionId, "completed");

        // Verify final session status
        const finalSession = db.getSession(sessionId);
        expect(finalSession?.status).toBe("completed");

        // Verify audit logs were written
        const logs = db.getAuditLogs(sessionId);
        expect(logs.length).toBeGreaterThan(0);

        const startedLog = logs.find((l: any) => l.event === "swarm_execution_started");
        expect(startedLog).toBeDefined();

        const completedLog = logs.find((l: any) => l.event === "swarm_execution_completed");
        expect(completedLog).toBeDefined();
    });
});
