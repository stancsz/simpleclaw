import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { executeSwarmManifest } from "../core/dispatcher";
import type { SwarmManifest, Task } from "../core/types";
import * as fs from "fs";
import { getKMSProvider } from "../security/kms";
import * as llm from "../core/llm";

// 1. Mock the openAI call
mock.module("../core/llm", () => ({
  parseIntentToManifest: mock(async (prompt: string, availableSkills: string[]): Promise<SwarmManifest> => {
    return {
      version: "1.0",
      intent_parsed: prompt,
      skills_required: ["mock-skill"],
      credentials_required: ["mock_token"],
      steps: [
        {
          id: "step-1",
          description: "Mock Step",
          worker: "worker-mock",
          skills: ["mock-skill"],
          credentials: ["mock_token"],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };
  }),
}));

describe("Comprehensive Orchestration Flow Integration Test", () => {
  let db: DBClient;

  beforeEach(() => {
    process.env.KMS_PROVIDER = "local";

    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);

    // Mock skill in isolated directory
    try {
      const testSkillDir = "src/workers/skills/test-integration";
      fs.mkdirSync(testSkillDir, { recursive: true });
      fs.writeFileSync(`${testSkillDir}/mock-skill.md`, "# Mock Skill\nThis is a mock skill for testing.");
    } catch (e) {
      // Ignore
    }
  });

  afterEach(() => {
    delete process.env.KMS_PROVIDER;

    // Clean up test skill directory
    try {
      fs.rmSync("src/workers/skills/test-integration", { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it("should successfully execute a simple single-worker flow", async () => {
    // 1. Setup Motherboard
    const kmsProvider = getKMSProvider();
    const encryptedServiceRole = await kmsProvider.encrypt("super_secret_supabase_key");
    db.applyMigration(`
      INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('user_flow_1', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    const encryptedMockToken = await kmsProvider.encrypt("mock_token_value_123");
    db.applyMigration(`
      INSERT INTO vault_user_secrets (id, user_id, name, secret, provider)
      VALUES ('mock_token', 'user_flow_1', 'Mock Token', '${encryptedMockToken}', 'mock');
    `);

    // 2. Parse Intent
    const userIntent = "Execute mock flow";
    const manifest = await llm.parseIntentToManifest(userIntent, ["mock-skill"]);

    // 3. Create Session
    const sessionId = db.createSession("user_flow_1", { prompt: userIntent }, manifest);

    // 4. Dispatch
    const results = await executeSwarmManifest(manifest, sessionId, db);

    // 5. Assertions
    expect(results["step-1"]).toBeDefined();
    expect(results["step-1"].status).toBe("success");

    const dbClientAny = db as any;

    // Check Task Results
    const taskLogs = dbClientAny.db.query("SELECT * FROM task_results WHERE session_id = ?").all(sessionId);
    expect(taskLogs.length).toBe(1);
    expect(taskLogs[0].status).toBe("success");
    expect(taskLogs[0].skill_ref).toBe("mock-skill");

    // Check Audit Logs
    const auditLogs = dbClientAny.db.query("SELECT * FROM audit_log WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
    const auditEvents = auditLogs.map((log: any) => log.event);

    expect(auditEvents).toContain("swarm_execution_started");
    expect(auditEvents).toContain("worker_loading_skill");
    expect(auditEvents).toContain("worker_decrypted_credential");
    expect(auditEvents).toContain("worker_completed");
    expect(auditEvents).toContain("swarm_execution_completed");

    const decryptLog = auditLogs.find((log: any) => log.event === "worker_decrypted_credential");
    const decryptMeta = JSON.parse(decryptLog.metadata);
    expect(decryptMeta.cred_id).toBe("mock_token");
    expect(decryptMeta.decrypted_value).toBe("[masked]");
  });

  it("should successfully execute a multi-worker DAG with dependencies", async () => {
    const kmsProvider = getKMSProvider();
    const encryptedServiceRole = await kmsProvider.encrypt("mock_service_role");
    // 1. Setup Motherboard
    db.applyMigration(`
      INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('user_flow_2', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Multi-worker DAG",
      skills_required: ["mock-skill"],
      credentials_required: [],
      steps: [
        {
          id: "step-1",
          description: "Step 1",
          worker: "worker-1",
          skills: ["mock-skill"],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
        {
          id: "step-2",
          description: "Step 2",
          worker: "worker-2",
          skills: ["mock-skill"],
          credentials: [],
          depends_on: ["step-1"],
          action_type: "READ",
        },
        {
          id: "step-3",
          description: "Step 3",
          worker: "worker-3",
          skills: ["mock-skill"],
          credentials: [],
          depends_on: ["step-2"],
          action_type: "READ",
        },
      ],
    };

    const sessionId = db.createSession("user_flow_2", { prompt: "test" }, manifest);

    // 2. Dispatch
    const results = await executeSwarmManifest(manifest, sessionId, db);

    // 3. Assertions
    expect(results["step-1"].status).toBe("success");
    expect(results["step-2"].status).toBe("success");
    expect(results["step-3"].status).toBe("success");

    const dbClientAny = db as any;
    const auditLogs = dbClientAny.db.query("SELECT * FROM audit_log WHERE event = 'worker_completed' ORDER BY created_at ASC").all();

    expect(auditLogs.length).toBe(3);
    const completedTaskIds = auditLogs.map((log: any) => JSON.parse(log.metadata).task_id);
    expect(completedTaskIds).toEqual(["step-1", "step-2", "step-3"]);
  });

  it("should handle worker failure and skip dependent steps", async () => {
    db.applyMigration(`
      INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('user_flow_3', 'https://mock.supabase.co', 'mock_service_role');
    `);

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Failure test",
      skills_required: ["mock-skill"],
      credentials_required: [],
      steps: [
        {
          id: "fail-step-1",
          description: "Will fail",
          worker: "worker-1",
          skills: ["mock-skill"],
          credentials: [],
          depends_on: [],
          action_type: "READ",
        },
        {
          id: "fail-step-2",
          description: "Should skip",
          worker: "worker-2",
          skills: ["mock-skill"],
          credentials: [],
          depends_on: ["fail-step-1"],
          action_type: "READ",
        },
      ],
    };

    // Force failure for "fail-step-1" by mocking writeAuditLog temporarily
    const originalLog = db.writeAuditLog.bind(db);
    db.writeAuditLog = (session, event, meta) => {
      if (meta && meta.task_id === "fail-step-1" && event === "worker_loading_skill") {
        throw new Error("Simulated worker failure");
      }
      originalLog(session, event, meta);
    };

    try {
      const sessionId = db.createSession("user_flow_3", { prompt: "test" }, manifest);
      const results = await executeSwarmManifest(manifest, sessionId, db);

      expect(results["fail-step-1"].status).toBe("error");
      expect(results["fail-step-1"].error).toBe("Simulated worker failure");

      expect(results["fail-step-2"].status).toBe("error");
      expect(results["fail-step-2"].error).toContain("Dependency failed");

      const dbClientAny = db as any;
      const skipLog = dbClientAny.db.query("SELECT * FROM audit_log WHERE session_id = ? AND event = 'worker_skipped_dependency_failed'").all(sessionId);
      expect(skipLog.length).toBe(1);

    } finally {
      db.writeAuditLog = originalLog;
    }
  });

  it("should enforce idempotency for WRITE tasks", async () => {
    const kmsProvider = getKMSProvider();
    const encryptedServiceRole = await kmsProvider.encrypt("mock_service_role");
    db.applyMigration(`
      INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('user_flow_4', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Idempotency test",
      skills_required: ["mock-skill"],
      credentials_required: [],
      steps: [
        {
          id: "idempotent-step",
          description: "WRITE step",
          worker: "worker-1",
          skills: ["mock-skill"],
          credentials: [],
          depends_on: [],
          action_type: "WRITE",
        },
      ],
    };

    const sessionId = db.createSession("user_flow_4", { prompt: "test" }, manifest);

    // 1. First execution
    const results1 = await executeSwarmManifest(manifest, sessionId, db);
    expect(results1["idempotent-step"].status).toBe("success");

    // 2. Second execution with SAME task ID
    const results2 = await executeSwarmManifest(manifest, sessionId, db);
    expect(results2["idempotent-step"].status).toBe("skipped");
    expect(results2["idempotent-step"].output?.message).toContain("idempotency check");

    const dbClientAny = db as any;
    const skipLog = dbClientAny.db.query("SELECT * FROM audit_log WHERE session_id = ? AND event = 'worker_skipped_idempotent'").all(sessionId);
    expect(skipLog.length).toBe(1);
  });
});
