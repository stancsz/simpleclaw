import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import { executeWorkerTask } from "./template";
import { executeSwarmManifest } from "../core/dispatcher";
import type { SwarmManifest, Task } from "../core/types";
import { ExecutionMonitor } from "../core/execution-monitor";
import * as fs from "fs";

describe("Worker Execution Module", () => {
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

    // Create sessions with specific user IDs
    const sessionMonitorTestId = db.createSession("user_monitor_test", { prompt: "test" }, {});
    db.applyMigration(`UPDATE orchestrator_sessions SET id = 'session-monitor-test-exec-${Date.now()}' WHERE id = '${sessionMonitorTestId}';`);
    platformDbMock.set("user_monitor_test", { supabaseUrl: "https://mock.supabase.co", encryptedKey: encrypted });

    const sessionIdempotentId = db.createSession("user_idempotent", { prompt: "test idempotent" }, {});
    db.applyMigration(`UPDATE orchestrator_sessions SET id = 'session-idempotent-exec-${Date.now()}' WHERE id = '${sessionIdempotentId}';`);
    platformDbMock.set("user_idempotent", { supabaseUrl: "https://mock.supabase.co", encryptedKey: encrypted });

    // Mock fetch for Cloud Function worker dispatch simulation
    originalFetch = global.fetch;
    process.env.FORCE_MOCK_FETCH = "true";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.FORCE_MOCK_FETCH;
    const { platformDbMock } = require("../workers/template");
    platformDbMock.clear();
  });

  it("should track execution state correctly via ExecutionMonitor", async () => {
    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Test execution monitor",
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
        }
      ],
    };

    global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        return new Response(JSON.stringify({
           result: { status: "success", output: { mock: "value" } }
        }), {
           status: 200,
           headers: { "Content-Type": "application/json" }
        });
    };

    const sessionIdRaw = db.createSession("user_monitor_test", { prompt: "test" }, manifest);
    const newSessionId = `session-monitor-test-exec-1-${Date.now()}`;
    db.applyMigration(`UPDATE orchestrator_sessions SET id = '${newSessionId}' WHERE id = '${sessionIdRaw}';`);

    const monitor = new ExecutionMonitor(db, newSessionId);

    let progressEvents = 0;

    // We expect the execution to resolve cleanly
    const results = await monitor.startAndMonitor(manifest, (progress) => {
        progressEvents++;
        // If there are results, verify they are structured correctly
        if (progress.length > 0) {
            expect(progress[0].worker_id).toBeDefined();
            expect(progress[0].status).toBeDefined();
        }
    });

    expect(results["step-1"].status).toBe("success");
    expect(progressEvents).toBeGreaterThan(0); // Ensure the callback was invoked

    // Session status should be completed
    const session = db.getSession(newSessionId);
    expect(session.status).toBe("completed");
  });

  it("should fail validation and not crash ExecutionMonitor if executeSwarmManifest fails", async () => {
    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Test execution monitor failure",
      skills_required: [],
      credentials_required: [],
      steps: [
        {
          id: "step-fail",
          description: "Step fail",
          worker: "w1",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        }
      ],
    };

    const executionEngineModule = require("../core/execution-engine");
    const originalExecute = executionEngineModule.OpenCodeExecutionEngine.prototype.execute;

    executionEngineModule.OpenCodeExecutionEngine.prototype.execute = async function(task: any, context: any) {
        throw new Error("Internal Server Error");
    };

    const sessionIdRaw = db.createSession("user_monitor_test", { prompt: "test fail" }, manifest);
    const newSessionId = `session-monitor-test-exec-2-${Date.now()}`;
    db.applyMigration(`UPDATE orchestrator_sessions SET id = '${newSessionId}' WHERE id = '${sessionIdRaw}';`);

    const monitor = new ExecutionMonitor(db, newSessionId);

    try {
        await monitor.startAndMonitor(manifest);
        expect(true).toBe(false); // Should not reach here
    } catch (error) {
        expect(error).toBeDefined();
    }

    const session = db.getSession(newSessionId);
    // Since the worker task internally returned an error status in our mock
    // executeSwarmManifest completes but has errors, so it correctly marks the session as 'error'.
    expect(session.status).toBe("error");

    executionEngineModule.OpenCodeExecutionEngine.prototype.execute = originalExecute;
  });

  it("should enforce idempotency correctly", async () => {
      const dbClientAny = db as any;
      const row = dbClientAny.db.query("SELECT id FROM orchestrator_sessions WHERE id LIKE 'session-idempotent-exec-%'").get();
      const sessionId = row.id;

      const task: Task = {
          id: "task-write-idempotent",
          description: "A write task",
          worker: "worker-1",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "WRITE",
      };

      const result1 = await executeWorkerTask(task, sessionId, db);
      expect(result1.status).toBe("success");

      const result2 = await executeWorkerTask(task, sessionId, db);
      expect(result2.status).toBe("skipped");
      expect(result2.output?.message).toContain("idempotency check");
  });
});
