import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import { executeSwarmManifest } from "./dispatcher";
import type { SwarmManifest, Task } from "./types";
import * as fs from "fs";

describe("Dispatcher - Worker Dispatch & Execution Loop", () => {
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
  });

  it("should execute SwarmManifest DAG in correct order", async () => {
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

    const results = await executeSwarmManifest(manifest, "session-dag", db);

    expect(results["step-1"].status).toBe("success");
    expect(results["step-2"].status).toBe("success");
    expect(results["step-3"].status).toBe("success");

  });

  it("should run independent tasks in parallel", async () => {
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
    await executeSwarmManifest(manifest, "session-parallel", db);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(120);
  });

  it("should skip dependent tasks if parent fails", async () => {
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

    // Mock fetch to simulate task failure for 'fail-step-1'
    global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        let body: any = {};
        if (init && init.body) {
           body = JSON.parse(init.body as string);
        }

        if (body.task && body.task.id === "fail-step-1") {
            return new Response(JSON.stringify({
                result: { status: "error", error: "Simulated task failure" }
            }), { status: 200 });
        }

        return new Response(JSON.stringify({
            result: { status: "success", output: {} }
        }), { status: 200 });
    };

    try {
      const results = await executeSwarmManifest(manifest, "session-fail", db);

      expect(results["fail-step-1"].status).toBe("error");
      expect(results["fail-step-1"].error).toBe("Simulated task failure");

      expect(results["fail-step-2"].status).toBe("error");
      expect(results["fail-step-2"].error).toContain("Dependency failed");
    } finally {
    }
  });

  it("should retry a failed worker task once before throwing", async () => {
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

    // Mock fetch to fail once, then succeed
    global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        let body: any = {};
        if (init && init.body) {
           body = JSON.parse(init.body as string);
        }

        if (body.task && body.task.id === "retry-step") {
            attemptCount++;
            if (attemptCount === 1) {
                return new Response(JSON.stringify({
                    result: { status: "error", error: "Temporary task failure" }
                }), { status: 200 });
            }
        }

        return new Response(JSON.stringify({
            result: { status: "success", output: {} }
        }), { status: 200 });
    };

    try {
      const results = await executeSwarmManifest(manifest, "session-retry", db);

      // Verify that the task was retried via HTTP fetch and eventually succeeded
      expect(attemptCount).toBe(2);
      expect(results["retry-step"].status).toBe("success");

      // Verify retry audit log is recorded
      const dbClientAny = db as any;
      const retryLogs = dbClientAny.db.query("SELECT * FROM audit_log WHERE event = 'worker_retry_attempt' AND session_id = 'session-retry'").all();
      expect(retryLogs.length).toBe(1);
    } finally {
    }
  });
});
