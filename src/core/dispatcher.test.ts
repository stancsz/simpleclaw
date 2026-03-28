import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import { executeSwarmManifest } from "./dispatcher";
import type { SwarmManifest, Task } from "./types";
import * as fs from "fs";

describe("Dispatcher - Worker Dispatch & Execution Loop", () => {
  let db: DBClient;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    // Create an in-memory DB for tests
    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);

    const { platformDbMock } = require("../workers/template");
    const kmsProvider = require("../security/kms").getKMSProvider();
    const encrypted = await kmsProvider.encrypt("mock_key");

    // The sessionId itself is not the user_id. executeSwarmManifest fetches the user via the session.
    // We need to create mock sessions with specific user IDs that we also mock in platformDb.

    const sessionDagId = db.createSession("user_dag", { prompt: "Test ordered DAG" }, {});
    db.applyMigration(`UPDATE orchestrator_sessions SET id = 'session-dag-disp-${Date.now()}' WHERE id = '${sessionDagId}';`);
    platformDbMock.set("user_dag", { supabaseUrl: "https://mock.supabase.co", encryptedKey: encrypted });
    db.addGasCredits("user_dag", 10);

    const sessionParallelId = db.createSession("user_parallel", { prompt: "Test parallel DAG" }, {});
    db.applyMigration(`UPDATE orchestrator_sessions SET id = 'session-parallel-disp-${Date.now()}' WHERE id = '${sessionParallelId}';`);
    platformDbMock.set("user_parallel", { supabaseUrl: "https://mock.supabase.co", encryptedKey: encrypted });
    db.addGasCredits("user_parallel", 10);

    const sessionFailId = db.createSession("user_fail", { prompt: "Test failure handling" }, {});
    db.applyMigration(`UPDATE orchestrator_sessions SET id = 'session-fail-disp-${Date.now()}' WHERE id = '${sessionFailId}';`);
    platformDbMock.set("user_fail", { supabaseUrl: "https://mock.supabase.co", encryptedKey: encrypted });
    db.addGasCredits("user_fail", 10);

    const sessionRetryId = db.createSession("user_retry", { prompt: "Test retry logic" }, {});
    db.applyMigration(`UPDATE orchestrator_sessions SET id = 'session-retry-disp-${Date.now()}' WHERE id = '${sessionRetryId}';`);
    platformDbMock.set("user_retry", { supabaseUrl: "https://mock.supabase.co", encryptedKey: encrypted });
    db.addGasCredits("user_retry", 10);

    // Mock fetch for Cloud Function worker dispatch simulation
    originalFetch = global.fetch;
    process.env.FORCE_MOCK_FETCH = "true";
    global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        // Return a default successful WorkerResult object via HTTP
        const responseBody = {
           result: { status: "success", output: { mock: "value" } }
        };
        return new Response(JSON.stringify(responseBody), {
           status: 200,
           headers: { "Content-Type": "application/json" }
        });
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.FORCE_MOCK_FETCH;
    const { platformDbMock } = require("../workers/template");
    platformDbMock.clear();
  });

  it("should execute SwarmManifest DAG in correct order", async () => {
    const dbClientAny = db as any;
    const row = dbClientAny.db.query("SELECT id FROM orchestrator_sessions WHERE id LIKE 'session-dag-disp-%'").get();
    const sessionId = row.id;
    const initialBalance = db.getBalance("user_dag");

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Test ordered DAG",
      skills_required: [],
      credentials_required: [],
      steps: [
        {
          id: "step-1",
          description: "Step 1",
          worker: "w1",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
        {
          id: "step-2",
          description: "Step 2",
          worker: "w2",
          skills: [],
          credentials: [],
          depends_on: ["step-1"],
          action_type: "READ",
        },
        {
          id: "step-3",
          description: "Step 3",
          worker: "w3",
          skills: [],
          credentials: [],
          depends_on: ["step-2"],
          action_type: "READ",
        },
      ],
    };

    const results = await executeSwarmManifest(manifest, sessionId, db);

    expect(results["step-1"].status).toBe("success");
    expect(results["step-2"].status).toBe("success");
    expect(results["step-3"].status).toBe("success");

    const newBalance = db.getBalance("user_dag");
    expect(newBalance).toBe(initialBalance - 1);
  });

  it("should run independent tasks in parallel", async () => {
    const dbClientAny = db as any;
    const row = dbClientAny.db.query("SELECT id FROM orchestrator_sessions WHERE id LIKE 'session-parallel-disp-%'").get();
    const sessionId = row.id;
    const initialBalance = db.getBalance("user_parallel");

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Test parallel DAG",
      skills_required: [],
      credentials_required: [],
      steps: [
        {
          id: "parallel-1",
          description: "Parallel 1",
          worker: "w1",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
        {
          id: "parallel-2",
          description: "Parallel 2",
          worker: "w2",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };

    const start = Date.now();
    await executeSwarmManifest(manifest, sessionId, db);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(120);

    const newBalance = db.getBalance("user_parallel");
    expect(newBalance).toBe(initialBalance - 1);
  });

  it("should skip dependent tasks if parent fails", async () => {
    const dbClientAny = db as any;
    const row = dbClientAny.db.query("SELECT id FROM orchestrator_sessions WHERE id LIKE 'session-fail-disp-%'").get();
    const sessionId = row.id;

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Test failure handling",
      skills_required: [],
      credentials_required: [],
      steps: [
        {
          id: "fail-step-1",
          description: "Will fail",
          worker: "w1",
          skills: ["fail-skill"],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
        {
          id: "fail-step-2",
          description: "Should skip",
          worker: "w2",
          skills: [],
          credentials: [],
          depends_on: ["fail-step-1"],
          action_type: "READ",
        },
      ],
    };

    // Mock execution engine to simulate task failure for 'fail-step-1'
    const executionEngineModule = require("./execution-engine");
    const originalExecute = executionEngineModule.OpenCodeExecutionEngine.prototype.execute;

    executionEngineModule.OpenCodeExecutionEngine.prototype.execute = async function(task: any, context: any) {
        if (task.id === "fail-step-1") {
            throw new Error("Simulated task failure");
        }
        return { mock: "value" };
    };

    const initialBalance = db.getBalance("user_fail");

    try {
      const results = await executeSwarmManifest(manifest, sessionId, db);

      expect(results["fail-step-1"].status).toBe("error");
      expect(results["fail-step-1"].error).toBe("Simulated task failure");

      expect(results["fail-step-2"].status).toBe("error");
      expect(results["fail-step-2"].error).toContain("Dependency failed");

      // Credits are debited even if tasks fail partially, as execution ran
      const newBalance = db.getBalance("user_fail");
      expect(newBalance).toBe(initialBalance - 1);
    } finally {
        executionEngineModule.OpenCodeExecutionEngine.prototype.execute = originalExecute;
    }
  });

  it("should retry a failed worker task once before throwing", async () => {
    const dbClientAny = db as any;
    const row = dbClientAny.db.query("SELECT id FROM orchestrator_sessions WHERE id LIKE 'session-retry-disp-%'").get();
    const sessionId = row.id;

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Test retry logic",
      skills_required: [],
      credentials_required: [],
      steps: [
        {
          id: "retry-step",
          description: "Will fail once then succeed",
          worker: "w1",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };

    let attemptCount = 0;

    const executionEngineModule = require("./execution-engine");
    const originalExecute = executionEngineModule.OpenCodeExecutionEngine.prototype.execute;

    executionEngineModule.OpenCodeExecutionEngine.prototype.execute = async function(task: any, context: any) {
        if (task.id === "retry-step") {
            attemptCount++;
            if (attemptCount === 1) {
                throw new Error("Temporary task failure");
            }
        }
        return { mock: "value" };
    };

    const initialBalance = db.getBalance("user_retry");

    try {
      const results = await executeSwarmManifest(manifest, sessionId, db);

      // Verify that the task was retried and eventually succeeded
      expect(attemptCount).toBe(2);
      expect(results["retry-step"].status).toBe("success");

      // Verify retry audit log is recorded
      const retryLogs = dbClientAny.db.query("SELECT * FROM audit_log WHERE event = 'worker_retry_attempt' AND session_id = ?").all(sessionId);
      expect(retryLogs.length).toBe(1);

      const newBalance = db.getBalance("user_retry");
      expect(newBalance).toBe(initialBalance - 1);
    } finally {
        executionEngineModule.OpenCodeExecutionEngine.prototype.execute = originalExecute;
    }
  });

  it("should fail execution upfront if user has no gas balance", async () => {
    // Create user with zero balance
    const sessionNoGasId = db.createSession("user_nogas", { prompt: "Test no gas" }, {});
    db.applyMigration(`UPDATE orchestrator_sessions SET id = 'session-nogas-disp-${Date.now()}' WHERE id = '${sessionNoGasId}';`);

    const dbClientAny = db as any;
    const row = dbClientAny.db.query("SELECT id FROM orchestrator_sessions WHERE id LIKE 'session-nogas-disp-%'").get();
    const sessionId = row.id;

    // Explicitly set gas balance to 0 for user_nogas (as getGasBalance auto-creates with 10 for unknown)
    db.applyMigration(`
      INSERT INTO gas_ledger (id, user_id, balance_credits) VALUES ('nogas_ledger', 'user_nogas', 0)
      ON CONFLICT(id) DO UPDATE SET balance_credits = 0;
      UPDATE gas_ledger SET balance_credits = 0 WHERE user_id = 'user_nogas';
    `);

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Test no gas",
      skills_required: [],
      credentials_required: [],
      steps: [
        {
          id: "nogas-step",
          description: "Should not run",
          worker: "w1",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };

    const results = await executeSwarmManifest(manifest, sessionId, db);
    expect(results).toHaveProperty("error");
    expect(results.error?.error).toBe("Insufficient gas credits");

    const newBalance = db.getBalance("user_nogas");
    expect(newBalance).toBe(0);
  });
});
