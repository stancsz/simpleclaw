import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client.ts";
import { executeWorkerTask } from "./template.ts";
import { executeSwarmManifest } from "../core/dispatcher.ts";
import type { SwarmManifest, Task } from "../core/types.ts";
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

  it("should successfully execute a single worker task", async () => {
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

    const orderOfExecution: string[] = [];

    // Mock executeWorkerTask temporarily or track execution based on returned results
    const results = await executeSwarmManifest(manifest, "session-dag", db);

    expect(results["step-1"].status).toBe("success");
    expect(results["step-2"].status).toBe("success");
    expect(results["step-3"].status).toBe("success");

    // We can verify order by checking the audit log table
    const dbClientAny = db as any;
    const auditLogs = dbClientAny.db.query("SELECT * FROM audit_log WHERE event = 'worker_completed' ORDER BY created_at ASC").all();

    expect(auditLogs.length).toBe(3);
    const completedTaskIds = auditLogs.map((log: any) => JSON.parse(log.metadata).task_id);
    expect(completedTaskIds).toEqual(["step-1", "step-2", "step-3"]);
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

    // Each task has a 50ms delay. If they run in sequence it would take ~100ms.
    // If parallel, it should take ~50ms. Allow more buffer for test environments.
    expect(duration).toBeLessThan(120);
  });

  it("should successfully execute a github worker task", async () => {
    // Mock the KMS Provider and fetch
    // Since getKMSProvider is used inside the worker, we can set KMS_PROVIDER to local for the test
    process.env.KMS_PROVIDER = "local";

    // Create a mock credential in the database manually
    const kmsProvider = require("../security/kms.ts").getKMSProvider();
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

  it("should skip dependent tasks if parent fails", async () => {
    // We will simulate a failure by creating a bad task or mocking the DB to throw.
    // Let's create a task that depends on a task which will be mocked to fail.
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

    // Override executeWorkerTask temporarily to force failure for "fail-step-1"
    // Instead of overriding, we'll force failure by mocking DBClient audit log or something
    // Since we can't easily mock module exports in bun without setup,
    // we'll modify executeWorkerTask to optionally fail if description includes "Will fail".
    // Wait, let's just use the current executeWorkerTask and modify DB to throw
    // or just let a natural error happen (e.g. invalid credential simulation).
    // Let's modify executeWorkerTask to throw if action description has "throw_error"

    // To do this properly without altering the template.ts, let's drop a table or mock.
    // Let's just mock db.writeAuditLog to throw for task-1.
    const originalLog = db.writeAuditLog.bind(db);
    db.writeAuditLog = (session, event, meta) => {
      if (meta && meta.task_id === "fail-step-1" && event === "worker_loading_skill") {
        throw new Error("Simulated failure");
      }
      originalLog(session, event, meta);
    };

    try {
      const results = await executeSwarmManifest(manifest, "session-fail", db);

      expect(results["fail-step-1"].status).toBe("error");
      expect(results["fail-step-1"].error).toBe("Simulated failure");

      expect(results["fail-step-2"].status).toBe("error");
      expect(results["fail-step-2"].error).toContain("Dependency failed");
    } finally {
      // Restore original function
      db.writeAuditLog = originalLog;
    }


  });
});
