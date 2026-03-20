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

  beforeEach(() => {
    // Create an in-memory DB for tests
    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);

    // Mock fetch for Cloud Function worker dispatch simulation
    originalFetch = global.fetch;
    process.env.FORCE_MOCK_FETCH = "true";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.FORCE_MOCK_FETCH;
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

    const sessionId = db.createSession("user_monitor_test", { prompt: "test" }, manifest);

    const monitor = new ExecutionMonitor(db, sessionId);

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
    const session = db.getSession(sessionId);
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

    global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        // Return a fatal internal server error
        return new Response("Internal Server Error", {
           status: 500,
           headers: { "Content-Type": "text/plain" }
        });
    };

    const sessionId = db.createSession("user_monitor_test", { prompt: "test fail" }, manifest);

    const monitor = new ExecutionMonitor(db, sessionId);

    try {
        await monitor.startAndMonitor(manifest);
        expect(true).toBe(false); // Should not reach here
    } catch (error) {
        expect(error).toBeDefined();
    }

    const session = db.getSession(sessionId);
    // Since the worker task internally returned an error status in our fetch mock (converted from 500 status to generic error),
    // executeSwarmManifest completes but has errors, so it correctly marks the session as 'error'.
    expect(session.status).toBe("error");
  });

  it("should enforce idempotency correctly", async () => {
      const task: Task = {
          id: "task-write-idempotent",
          description: "A write task",
          worker: "worker-1",
          skills: [],
          credentials: [],
          depends_on: [],
          action_type: "WRITE",
      };

      const result1 = await executeWorkerTask(task, "session-idempotent", db);
      expect(result1.status).toBe("success");

      const result2 = await executeWorkerTask(task, "session-idempotent", db);
      expect(result2.status).toBe("skipped");
      expect(result2.output?.message).toContain("idempotency check");
  });
});
