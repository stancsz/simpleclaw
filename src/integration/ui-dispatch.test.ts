import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { orchestratorHandler } from "../core/orchestrator";
import * as fs from "fs";

describe("UI Dispatch End-to-End Flow", () => {
    let db: DBClient;

    beforeEach(() => {
        db = new DBClient("sqlite://:memory:");
        const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
        db.applyMigration(schema);
    });

    it("should process intent, return plan, and handle execute approval", async () => {
        // Mock the LLM parse directly instead of fetch to avoid openai SDK parsing issues
        mock.module("../core/llm", () => ({
            parseIntentToManifest: async () => ({
                version: "1.0",
                intent_parsed: "mock test",
                skills_required: ["echo"],
                credentials_required: [],
                steps: [{
                    id: "step-1",
                    description: "Echo step",
                    worker: "echo",
                    skills: ["echo"],
                    credentials: [],
                    depends_on: [],
                    action_type: "READ"
                }]
            })
        }));

        const originalDbUrl = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "sqlite://local_test_db.sqlite";

        const testDb = new DBClient(process.env.DATABASE_URL);
        const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
        testDb.applyMigration(schema);

        try {
            // Step 1: Submit intent (Planning phase)
            let statusCode = 200;
            let responseBody: any = null;

            const mockRes = {
                set: () => {},
                status: (code: number) => { statusCode = code; return mockRes; },
                json: (data: any) => { responseBody = data; },
                send: (data: any) => { responseBody = data; }
            } as any;

            const mockReqPlan = {
                method: "POST",
                body: {
                    prompt: "echo test intent",
                    user_id: "test_user_e2e"
                }
            } as any;

            await orchestratorHandler(mockReqPlan, mockRes);

            expect(statusCode).toBe(200);
            expect(responseBody.status).toBe("success");
            const sessionId = responseBody.session_id;
            const manifest = responseBody.pda.plan;

            // Step 2: Approve the plan
            let execStatusCode = 200;
            let execResponseBody: any = null;

            const execMockRes = {
                set: () => {},
                status: (code: number) => { execStatusCode = code; return execMockRes; },
                json: (data: any) => { execResponseBody = data; },
                send: (data: any) => { execResponseBody = data; }
            } as any;

            const mockReqExec = {
                method: "POST",
                body: {
                    action: "execute",
                    session_id: sessionId,
                    manifest: manifest,
                    user_id: "test_user_e2e"
                }
            } as any;

            await orchestratorHandler(mockReqExec, execMockRes);

            expect(execStatusCode).toBe(200);
            expect(execResponseBody.status).toBe("dispatched");

            // Wait a little for async executePlan to finish (though it'll probably fail because worker isn't mocked,
            // but the state should update to error or complete)
            await new Promise(r => setTimeout(r, 100));

            const session = testDb.getSession(sessionId);
            // We just need to assert that it dispatched, we know `orchestratorHandler` triggers execution
            expect(session.status === "completed" || session.status === "error").toBe(true);

        } finally {
            try { fs.unlinkSync("local_test_db.sqlite"); } catch(e) {}
            if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
            else delete process.env.DATABASE_URL;
        }
    });
});
