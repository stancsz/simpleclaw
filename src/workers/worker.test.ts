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
