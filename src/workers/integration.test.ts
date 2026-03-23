import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import { executeWorkerTask } from "./template";
import { executeSwarmManifest } from "../core/dispatcher";
import type { SwarmManifest, Task } from "../core/types";
import { getKMSProvider } from "../security/kms";
import * as fs from "fs";

describe("Worker End-to-End Integration", () => {
  let db: DBClient;

  beforeEach(() => {
    // 1. Mock a Supabase client connected to the local SQLite motherboard
    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);

    // Set local KMS provider
    process.env.KMS_PROVIDER = "local";
  });

  afterEach(() => {
    delete process.env.KMS_PROVIDER;
  });

  it("should simulate a complete real worker execution lifecycle", async () => {
    // 2. Simulate KMS decryption flow
    const kmsProvider = getKMSProvider();
    const testSecret = "mock_api_key_12345";
    const encryptedSecret = await kmsProvider.encrypt(testSecret);

    const encryptedServiceRole = await kmsProvider.encrypt("mock_service_role_key");
    db.applyMigration(`
      INSERT OR IGNORE INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('test_user_id', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    // Manually mock simulateReadSecret to return our encrypted secret for testing
    const originalSimulateReadSecret = db.simulateReadSecret.bind(db);
    db.simulateReadSecret = (credId: string) => {
      if (credId === "my_mock_credential") return encryptedSecret;
      return originalSimulateReadSecret(credId);
    };

    // 3. Create a simple test skill
    const skillContent = `---
skill_name: simple-test-skill
version: 1.0.0
---
# Test Skill
This is a simple test skill to verify worker execution.
`;
    // Write test skill temporarily to the file system
    fs.writeFileSync("src/skills/simple-test-skill.md", skillContent);

    try {
      const task: Task = {
        id: "integration-task-1",
        description: "Test task execution",
        worker: "worker-1",
        skills: ["simple-test-skill"],
        credentials: ["my_mock_credential"],
        depends_on: [],
        action_type: "WRITE",
      };

      const manifest: SwarmManifest = {
        version: "1.0",
        intent_parsed: "Execute integration test",
        skills_required: ["simple-test-skill"],
        credentials_required: ["my_mock_credential"],
        steps: [task]
      };

      const sessionId = db.createSession("test_user_id", { prompt: "Test" }, manifest);

      // 4. Execute the worker via executeWorkerTask()
      const result = await executeWorkerTask(task, sessionId, db);

      // 5. Verify results are written to the task_results table
      expect(result.status).toBe("success");

      const dbClientAny = db as any;
      const resultsLogs = dbClientAny.db.query("SELECT * FROM task_results WHERE session_id = ?").all(sessionId);
      expect(resultsLogs.length).toBe(1);
      expect(resultsLogs[0].status).toBe("success");
      expect(resultsLogs[0].skill_ref).toBe("simple-test-skill");

      const parsedOutput = JSON.parse(resultsLogs[0].output);
      expect(parsedOutput.status).toBe("completed");
      expect(parsedOutput.skills_used).toEqual(["simple-test-skill"]);

      // Verify audit logs
      const auditLogs = db.getAuditLogs(sessionId);
      const logEvents = auditLogs.map(log => log.event);
      expect(logEvents).toContain("worker_loading_skill");
      expect(logEvents).toContain("worker_decrypted_credential");
      expect(logEvents).toContain("worker_completed");

      // 6. Verify idempotency checks work via transaction_log
      const transactionRow = dbClientAny.db.query("SELECT * FROM transaction_log WHERE idempotency_key = ?").get("integration-task-1");
      expect(transactionRow).toBeDefined();
      expect(transactionRow.status).toBe("completed");

      // Execute the exact same task again - should be skipped due to idempotency check
      const result2 = await executeWorkerTask(task, sessionId, db);
      expect(result2.status).toBe("skipped");

      const auditLogsAfterIdempotent = db.getAuditLogs(sessionId);
      const logEventsAfterIdempotent = auditLogsAfterIdempotent.map(log => log.event);
      expect(logEventsAfterIdempotent).toContain("worker_skipped_idempotent");

    } finally {
      // Clean up
      db.simulateReadSecret = originalSimulateReadSecret;
      try {
        fs.unlinkSync("src/skills/simple-test-skill.md");
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }
  });
}
);