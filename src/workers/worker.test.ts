import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import { executeWorkerTask } from "./template";
import { executeSwarmManifest } from "../core/dispatcher";
import type { SwarmManifest, Task } from "../core/types";
import * as fs from "fs";

describe("Worker Dispatch & Execution Loop", () => {
  let db: DBClient;

  beforeEach(() => {
    // Create an in-memory DB for tests
    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);
  });

  afterEach(() => {
    // Cleanup if necessary
  });

  it("should successfully execute a single worker task via delegation engine", async () => {
    // Spy on the engine execution to verify delegation actually occurs
    const executionEngineModule = require("../core/execution-engine");
    const originalExecute = executionEngineModule.OpenCodeExecutionEngine.prototype.execute;

    let executeCalledWith: any = null;
    executionEngineModule.OpenCodeExecutionEngine.prototype.execute = async function(task: any, context: any) {
      executeCalledWith = { task, context };
      return originalExecute.call(this, task, context);
    };

    const task: Task = {
      id: "task-1",
      description: "A simple task",
      worker: "worker-1",
      skills: ["skill-1"],
      credentials: ["cred-1"],
      depends_on: [],
      action_type: "READ",
    };

    const result = await executeWorkerTask(task, "session-1", db);

    expect(result.status).toBe("success");
    expect(result.output).toBeDefined();
    expect(result.output.message).toContain("task-1");
    expect(result.output.delegated_to).toBe("opencode-mock");
    expect(result.output.skills_used).toEqual(["skill-1"]);

    // Verify delegation details
    expect(executeCalledWith).not.toBeNull();
    expect(executeCalledWith.task.id).toBe("task-1");
    expect(executeCalledWith.context.sessionId).toBe("session-1");
    expect(executeCalledWith.context.credentials).toBeDefined();

    // Restore mock
    executionEngineModule.OpenCodeExecutionEngine.prototype.execute = originalExecute;
  });

  it("should enforce idempotency for WRITE tasks", async () => {
    const task: Task = {
      id: "task-write-1",
      description: "A write task",
      worker: "worker-1",
      skills: [],
      credentials: [],
      depends_on: [],
      action_type: "WRITE",
    };

    // First execution should succeed and write to transaction log
    const result1 = await executeWorkerTask(task, "session-idempotent", db);
    expect(result1.status).toBe("success");

    // Second execution with same task ID should be skipped
    const result2 = await executeWorkerTask(task, "session-idempotent", db);
    expect(result2.status).toBe("skipped");
    expect(result2.output?.message).toContain("idempotency check");
  });

  it("should not enforce idempotency for READ tasks", async () => {
    const task: Task = {
      id: "task-read-1",
      description: "A read task",
      worker: "worker-1",
      skills: [],
      credentials: [],
      depends_on: [],
      action_type: "READ",
    };

    const result1 = await executeWorkerTask(task, "session-read", db);
    expect(result1.status).toBe("success");

    const result2 = await executeWorkerTask(task, "session-read", db);
    expect(result2.status).toBe("success");
  });

  it("should successfully execute a github worker task", async () => {
    // Mock the KMS Provider and fetch
    // Since getKMSProvider is used inside the worker, we can set KMS_PROVIDER to local for the test
    process.env.KMS_PROVIDER = "local";

    // Create a mock credential in the database manually
    const kmsProvider = require("../security/kms").getKMSProvider();
    const testSecret = "ghp_mocktoken123456";
    const encryptedSecret = await kmsProvider.encrypt(testSecret);

    // We can just use the db mock to bypass actual DB write for setup if it's easier,
    // or we can mock simulateReadSecret on the DB client instance
    const originalSimulateReadSecret = db.simulateReadSecret.bind(db);
    db.simulateReadSecret = (credId: string) => {
      if (credId === "github_token") return encryptedSecret;
      return originalSimulateReadSecret(credId);
    };

    // We also need to mock global.fetch to intercept the GitHub API call
    const originalFetch = global.fetch;
    global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      if (url === "https://api.github.com/user" || url.toString().includes("api.github.com")) {
        // Verify the Auth header is present
        const headers: any = init?.headers || {};
        if (headers["Authorization"] === `Bearer ${testSecret}`) {
          return new Response(JSON.stringify({ login: "mockuser", id: 123 }), { status: 200 });
        }
        return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
      }
      return originalFetch(url, init);
    };

    try {
      const task: Task = {
        id: "gh-task-1",
        description: "List my GitHub profile",
        worker: "github",
        skills: ["github"],
        credentials: ["github_token"],
        depends_on: [],
        action_type: "READ",
      };

      const result = await executeSwarmManifest({
        version: "1.0",
        intent_parsed: "Test github worker",
        skills_required: ["github"],
        credentials_required: ["github_token"],
        steps: [task]
      }, "session-gh", db);

      expect(result["gh-task-1"].status).toBe("success");
      expect(result["gh-task-1"].output.api_response.login).toBe("mockuser");

      // Verify DB logging
      const dbClientAny = db as any;
      const resultsLogs = dbClientAny.db.query("SELECT * FROM task_results WHERE session_id = 'session-gh'").all();
      expect(resultsLogs.length).toBe(1);
      const parsedOutput = JSON.parse(resultsLogs[0].output);
      expect(parsedOutput.api_response.login).toBe("mockuser");

    } finally {
      db.simulateReadSecret = originalSimulateReadSecret;
      global.fetch = originalFetch;
    }
  });

  it("should support end-to-end execution of a simple fetch mock data intent", async () => {
    // 1. Setup Motherboard
    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Fetch mock data",
      skills_required: ["mock-skill"],
      credentials_required: [],
      steps: [
        {
          id: "fetch-mock-data",
          description: "Fetch mock data task",
          worker: "worker-mock",
          skills: ["mock-skill"],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };

    const sessionId = db.createSession("user_mock", { prompt: "Fetch mock data" }, manifest);

    // 2. Dispatch worker
    const result = await executeSwarmManifest(manifest, sessionId, db);

    // 3. Verify results
    expect(result["fetch-mock-data"].status).toBe("success");
    expect(result["fetch-mock-data"].output.message).toContain("fetch-mock-data");

    // Verify db logging
    const session = db.getSession(sessionId);
    expect(session.status).toBe("completed");
  });

  it("should handle execute payload via the orchestrator route interface", async () => {
    // 1. Setup Motherboard
    const kmsProvider = require("../security/kms").getKMSProvider();
    const encryptedServiceRole = await kmsProvider.encrypt("mock_service_role_key");
    db.applyMigration(`
      INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('user_execute_test', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    // 2. Create manifest requiring mock-skill
    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Execute approve->execute flow",
      skills_required: ["mock-skill"],
      credentials_required: [],
      steps: [
        {
          id: "execute-test",
          description: "Execute with execute action",
          worker: "worker-mock",
          skills: ["mock-skill"],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };

    const sessionId = db.createSession("user_execute_test", { prompt: "test execute" }, manifest);

    // Ensure session status starts off right
    db.updateSessionStatus(sessionId, "waiting_approval");

    // 3. We create a simulated Cloud Function request to the actual `orchestratorHandler`
    const { orchestratorHandler } = require("../core/orchestrator");

    const reqObj = {
      action: "execute",
      session_id: sessionId,
      manifest: manifest,
      user_id: "user_execute_test"
    };

    const mockReq = {
      method: "POST",
      body: reqObj
    } as any;

    let statusCode = 200;
    let responseBody: any = null;

    const mockRes = {
      set: (k: string, v: string) => {},
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        responseBody = data;
      },
      send: (data: string) => {
        responseBody = data;
      }
    } as any;

    // Use a custom mocked DBClient module or inject the db instance directly into `executeSwarmManifest` via mock,
    // but the simplest is just injecting it if possible. Since orchestratorHandler uses new DBClient,
    // we can use a memory fallback or rely on the async behavior.

    // Instead of overriding the internal DBClient which is hard without a mock library setup,
    // we'll use `bun test` mock capabilities.
    const originalDbUrl = process.env.DATABASE_URL;

    // Create a physical mock DB for the orchestrator to pick up
    // since it news up DBClient with DATABASE_URL
    const fs = require('fs');
    process.env.DATABASE_URL = "sqlite://local_test_db.sqlite";

    // Create the physical DB and apply migrations
    const testDb = new DBClient(process.env.DATABASE_URL);
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    testDb.applyMigration(schema);

    // Populate the session we expect
    testDb.createSession("user_execute_test", { prompt: "test execute" }, manifest);

    // We must manually grab the session ID since orchestrator handler will query it
    // But since the DB is recreated, our original sessionId from `db` might not be in testDb.
    // Let's grab the actual new session ID.
    const testDbAny = testDb as any;
    const sessionRow = testDbAny.db.query("SELECT id FROM orchestrator_sessions LIMIT 1").get();
    const actualSessionId = sessionRow.id;

    // Update the request object
    mockReq.body.session_id = actualSessionId;

    // Run the actual handler
    await orchestratorHandler(mockReq, mockRes);

    expect(statusCode).toBe(200);
    expect(responseBody.status).toBe("dispatched");
    expect(responseBody.executionId).toBe(actualSessionId);

    // Wait for the async worker dispatch to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify state transition inside our physical test DB instance
    const session = testDb.getSession(actualSessionId);
    expect(session.status).toBe("completed");

    // Clean up
    try {
        fs.unlinkSync("local_test_db.sqlite");
    } catch(e) {}

    // Restore DB env
    if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;
  });

  it("should simulate full end-to-end execution flow: user intent -> plan -> approve -> dispatch -> display", async () => {
    // 1. Setup Phase
    const kmsProvider = require("../security/kms").getKMSProvider();
    const encryptedServiceRole = await kmsProvider.encrypt("mock_service_role_key");
    db.applyMigration(`
      INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('user_full_flow', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    // We override global fetch just to simulate orchestrator POST for generation
    const { orchestratorHandler } = require("../core/orchestrator");
    const { parseIntentToManifest } = require("../core/llm");

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "A generated full flow intent",
      skills_required: ["mock-skill"],
      credentials_required: [],
      steps: [
        {
          id: "e2e-step-1",
          description: "End to end mock skill",
          worker: "worker-mock",
          skills: ["mock-skill"],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };

    const originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "sqlite://local_test_db_e2e_flow.sqlite";
    const fs = require('fs');
    const testDb = new DBClient(process.env.DATABASE_URL);
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    testDb.applyMigration(schema);

    testDb.applyMigration(`
      INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('user_full_flow', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    try {
        // Since we can't easily mock the llm module *after* it's loaded without jest.mock,
        // we will manually simulate the plan generation by directly inserting a session
        const sessionId = testDb.createSession("user_full_flow", { prompt: "Run full test" }, manifest);

        // Simulated Approve Request
        const executeReq = {
            method: "POST",
            body: {
                approved: true, // using the newly added approved=true endpoint trigger
                session_id: sessionId,
                manifest: manifest,
                user_id: "user_full_flow",
                prompt: "Run full test"
            }
        } as any;

        let executeStatusCode = 200;
        let executeResponseBody: any = null;

        const executeRes = {
            set: () => {},
            status: (code: number) => { executeStatusCode = code; return executeRes; },
            json: (data: any) => { executeResponseBody = data; },
            send: (data: string) => { executeResponseBody = data; }
        } as any;

        // Let's import the wrapper route
        // We have to mock NextRequest
        const { POST } = require("../../server/src/app/api/orchestrator/route");
        const nextReq = {
            json: async () => executeReq.body
        };

        const response = await POST(nextReq as any);
        const data = await response.json();

        expect(response.status).toBe(202);
        expect(data.status).toBe("dispatched");
        expect(data.executionId).toBe(sessionId);

        // Wait for workers to finish
        await new Promise(resolve => setTimeout(resolve, 100));

        const testDbAny = testDb as any;
        const taskLogs = testDbAny.db.query("SELECT * FROM task_results WHERE session_id = ?").all(sessionId);
        expect(taskLogs.length).toBe(1);
        expect(taskLogs[0].status).toBe("success");
        expect(taskLogs[0].skill_ref).toBe("mock-skill");
    } finally {
        try { fs.unlinkSync("local_test_db_e2e_flow.sqlite"); } catch(e) {}
        if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
        else delete process.env.DATABASE_URL;
    }
  });
});
