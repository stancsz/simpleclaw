import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { executeSwarmManifest } from "./dispatcher";
import { orchestratorHandler } from "./orchestrator";
import type { SwarmManifest, Task } from "./types";
import * as fs from "fs";

// Mock the openAI call to avoid hitting the actual API
import * as llm from "./llm";
mock.module("./llm", () => ({
  parseIntentToManifest: mock(async (prompt: string, availableSkills: string[]): Promise<SwarmManifest> => {
    return {
      version: "1.0",
      intent_parsed: "Test intent parsed",
      skills_required: ["test-skill"],
      credentials_required: [],
      steps: [
        {
          id: "test-task-1",
          description: "Execute test task",
          worker: "worker-test", // Use the test worker
          skills: ["test-skill"],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };
  }),
}));

// Mock executeWorkerTask globally to use our test-worker
import * as template from "../workers/template";
mock.module("../workers/template", () => {
  const { executeTestWorkerTask } = require("../workers/test-worker");
  return {
    ...template,
    executeWorkerTask: mock(async (task: Task, sessionId: string, db: DBClient) => {
        return executeTestWorkerTask(task, sessionId, db);
    })
  };
});

describe("Orchestrator End-to-End Integration Workflow", () => {
  let db: DBClient;
  const testDbUrl = "sqlite://local_integration_test_db.sqlite";
  let originalDbUrl: string | undefined;

  beforeEach(() => {
    // Save original env
    originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDbUrl;

    // Create an in-memory DB and run migrations
    // The handler news up DBClient and reads from env, so it will connect to this same physical db
    db = new DBClient(testDbUrl);

    // Using our newly created test-data schema
    const schema = fs.readFileSync("test-data/integration-schema.sql", "utf-8");
    db.applyMigration(schema);
  });

  afterEach(() => {
    // Clean up local physical DB file
    try {
      fs.unlinkSync(testDbUrl.replace("sqlite://", ""));
    } catch(e) {}

    // Restore env
    if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;
  });

  it("should complete orchestrator workflow: Plan -> Dispatch", async () => {
    const user_id = "e2e_user_123";

    // Setup initial user state with gas
    db.applyMigration(`
      INSERT OR IGNORE INTO gas_ledger (id, user_id, balance_credits)
      VALUES ('gas_id_123', '${user_id}', 100);
    `);

    // 1. Plan Phase (POST /api/orchestrator with prompt)
    const planReq = {
      method: 'POST',
      body: {
        prompt: "Execute test",
        user_id: user_id
      }
    } as any;

    let planStatusCode = 0;
    let planResponseBody: any = null;

    const planRes = {
      set: () => {},
      status: (code: number) => { planStatusCode = code; return planRes; },
      json: (data: any) => { planResponseBody = data; },
      send: (data: string) => { planResponseBody = data; }
    } as any;

    await orchestratorHandler(planReq, planRes);

    expect(planStatusCode).toBe(200);
    expect(planResponseBody.status).toBe('success');
    expect(planResponseBody.session_id).toBeDefined();

    const sessionId = planResponseBody.session_id;
    const pda = planResponseBody.pda;

    expect(pda).toBeDefined();
    expect(pda.plan.steps.length).toBe(1);
    expect(pda.plan.steps[0].id).toBe("test-task-1");
    expect(pda.status).toBe("waiting_approval");

    // Check DB state after planning
    const session = db.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session.status).toBe("active"); // In memory it's active until we manually set waiting_approval later but let's just verify creation.

    // 2. Dispatch / Approve Phase (POST /api/orchestrator with action)
    const approveReq = {
      method: 'POST',
      body: {
        action: 'approve',
        session_id: sessionId,
        user_id: user_id
      }
    } as any;

    let approveStatusCode = 0;
    let approveResponseBody: any = null;

    const approveRes = {
      set: () => {},
      status: (code: number) => { approveStatusCode = code; return approveRes; },
      json: (data: any) => { approveResponseBody = data; },
      send: (data: string) => { approveResponseBody = data; }
    } as any;

    await orchestratorHandler(approveReq, approveRes);

    expect(approveStatusCode).toBe(200);
    expect(approveResponseBody.status).toBe("dispatched");
    expect(approveResponseBody.executionId).toBe(sessionId);

    // Give asynchronous execution time to resolve inside the orchestrator
    await new Promise(r => setTimeout(r, 200));

    // Verify Motherboard Final State
    const finalSession = db.getSession(sessionId);
    expect(finalSession.status).toBe("completed");

    // Verify task results are logged
    const taskLogs = db.getTaskResults(sessionId);
    expect(taskLogs.length).toBe(1);
    expect(taskLogs[0].status).toBe("success");
    expect(taskLogs[0].worker_id).toBe("worker-test-task-1");

    // Verify Audit Logs
    const auditLogs = db.getAuditLogs(sessionId);
    const events = auditLogs.map(l => l.event);
    expect(events).toContain("swarm_execution_started");
    expect(events).toContain("worker_loading_skill");
    expect(events).toContain("worker_completed");
    expect(events).toContain("swarm_execution_completed");

    // Validate gas consumption (started with 100, should be 99 now)
    const gasBalance = db.getGasBalance(user_id);
    expect(gasBalance).toBe(99);
    expect(events).toContain("gas_consumed_for_session");
  });

  it("should handle insufficient gas errors gracefully", async () => {
    const user_id = "broke_user_123";

    // Setup user with 0 gas
    db.applyMigration(`
      INSERT OR IGNORE INTO gas_ledger (id, user_id, balance_credits)
      VALUES ('gas_broke_123', '${user_id}', 0);
    `);

    // 1. Manually create session to bypass planning phase for this test
    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Execute broke test",
      skills_required: [],
      credentials_required: [],
      steps: [
        {
          id: "task-fail-gas",
          description: "Execute",
          worker: "worker-test",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };
    const sessionId = db.createSession(user_id, { prompt: "fail me" }, manifest);

    // 2. Dispatch / Approve Phase
    const approveReq = {
      method: 'POST',
      body: {
        action: 'approve',
        session_id: sessionId,
        user_id: user_id
      }
    } as any;

    let approveStatusCode = 0;
    let approveResponseBody: any = null;

    const approveRes = {
      set: () => {},
      status: (code: number) => { approveStatusCode = code; return approveRes; },
      json: (data: any) => { approveResponseBody = data; },
      send: (data: string) => { approveResponseBody = data; }
    } as any;

    await orchestratorHandler(approveReq, approveRes);

    expect(approveStatusCode).toBe(402);
    expect(approveResponseBody.error).toContain("Insufficient gas credits");

    // Give asynchronous execution time to verify it actually halted
    await new Promise(r => setTimeout(r, 100));

    // Verify session marked as error
    const finalSession = db.getSession(sessionId);
    expect(finalSession.status).toBe("error");

    const auditLogs = db.getAuditLogs(sessionId);
    const events = auditLogs.map(l => l.event);
    expect(events).toContain("swarm_execution_failed");
  });

  it("should handle worker failures and correctly log errors", async () => {
    const user_id = "error_user_123";

    db.applyMigration(`
      INSERT OR IGNORE INTO gas_ledger (id, user_id, balance_credits)
      VALUES ('gas_error_123', '${user_id}', 10);
    `);

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Execute fail test",
      skills_required: [],
      credentials_required: [],
      steps: [
        {
          id: "task-simulate-error",
          description: "This task will fail",
          worker: "worker-test",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "READ",
          parameters: {
              simulate_failure: true,
              error_message: "Intentional crash for integration test"
          }
        },
      ],
    };

    const sessionId = db.createSession(user_id, { prompt: "crash me" }, manifest);

    // Call executeSwarmManifest directly for this to assert on results returned
    const results = await executeSwarmManifest(manifest, sessionId, db);

    expect(results["task-simulate-error"]).toBeDefined();
    expect(results["task-simulate-error"].status).toBe("error");
    expect(results["task-simulate-error"].error).toContain("Intentional crash for integration test");

    // Motherboard state check
    const finalSession = db.getSession(sessionId);
    expect(finalSession.status).toBe("error");

    const taskLogs = db.getTaskResults(sessionId);

    // There can be two log entries: one from the worker itself logging the error,
    // and one from dispatcher trying to catch/timeout errors depending on implementation.
    // The test framework captures the error state effectively.
    expect(taskLogs.length).toBeGreaterThanOrEqual(1);

    const errorLogs = taskLogs.filter((log: any) => log.status === "error");
    expect(errorLogs.length).toBeGreaterThanOrEqual(1);
    expect(errorLogs[0].error).toContain("Intentional crash for integration test");

    // User should have 1 less gas because the execution was initiated
    const gasBalance = db.getGasBalance(user_id);
    expect(gasBalance).toBe(9);
  });

  it("should enforce idempotency for WRITE tasks across duplicate executions", async () => {
    const user_id = "idempotent_user_123";

    db.applyMigration(`
      INSERT OR IGNORE INTO gas_ledger (id, user_id, balance_credits)
      VALUES ('gas_idempotent_123', '${user_id}', 10);
    `);

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Execute duplicate test",
      skills_required: [],
      credentials_required: [],
      steps: [
        {
          id: "task-write-op",
          description: "Perform a write operation",
          worker: "worker-test",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "WRITE"
        },
      ],
    };

    const sessionId1 = db.createSession(user_id, { prompt: "write data" }, manifest);

    // First run
    const result1 = await executeSwarmManifest(manifest, sessionId1, db);
    expect(result1["task-write-op"].status).toBe("success");

    // Verify transaction log recorded it
    const isCompletedFirstRun = db.checkIdempotency("task-write-op");
    expect(isCompletedFirstRun).toBe(true);

    // Duplicate run (simulate re-trying or a duplicate task id in another session)
    const sessionId2 = db.createSession(user_id, { prompt: "write data again" }, manifest);
    const result2 = await executeSwarmManifest(manifest, sessionId2, db);

    // Test worker should recognize idempotency and skip
    expect(result2["task-write-op"].status).toBe("skipped");
    expect(result2["task-write-op"].output?.message).toContain("due to idempotency check");

    // Second run should still be considered completed overall, just skipped execution
    const finalSession2 = db.getSession(sessionId2);
    expect(finalSession2.status).toBe("completed");
  });
});
