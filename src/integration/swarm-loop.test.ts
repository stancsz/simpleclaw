import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { executeSwarmManifest } from "../core/dispatcher";
import type { SwarmManifest, Task } from "../core/types";
import * as fs from "fs";
import { getKMSProvider } from "../security/kms";
import * as llm from "../core/llm";
import { orchestratorHandler } from "../core/orchestrator";
import type { Request, Response } from "@google-cloud/functions-framework";

// 1. Mock the openAI call
mock.module("../core/llm", () => ({
  parseIntentToManifest: mock(async (prompt: string, availableSkills: string[]): Promise<SwarmManifest> => {
    return {
      version: "1.0",
      intent_parsed: prompt,
      skills_required: ["echo"],
      credentials_required: ["test_cred"],
      steps: [
        {
          id: "step-echo",
          description: "Echo the intent",
          worker: "worker-echo",
          skills: ["echo"],
          credentials: ["test_cred"],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };
  }),
}));

describe("End-to-End Swarm Orchestration Loop", () => {
  let db: DBClient;
  let originalDbUrl: string | undefined;

  beforeEach(() => {
    process.env.KMS_PROVIDER = "local";
    originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "sqlite://:memory:";

    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);

    // Provide the DBClient constructor to the orchestrator to use the same in-memory DB connection logic (or test DB)
    mock.module("../db/client", () => ({
      DBClient: mock(() => db),
      getDbClient: mock(() => db),
    }));

    // Ensure src/skills directory exists (echo.md should already be there from the fixed version)
    try {
      fs.mkdirSync("src/skills", { recursive: true });
    } catch (e) {
      // Ignore
    }
  });

  afterEach(() => {
    delete process.env.KMS_PROVIDER;
    if (originalDbUrl) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }

    // No cleanup needed—echo.md remains in src/skills/
    mock.restore();
  });

  it("should complete the full swarm orchestration loop", async () => {
    // 1. Setup Motherboard
    const kmsProvider = getKMSProvider();
    const encryptedServiceRole = await kmsProvider.encrypt("super_secret_supabase_key");
    const encryptedMockToken = await kmsProvider.encrypt("mock_token_value_123");

    db.applyMigration(`
      INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('user_loop_1', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    db.applyMigration(`
      INSERT INTO vault_user_secrets (id, user_id, name, secret, provider)
      VALUES ('test_cred', 'user_loop_1', 'Test Credential', '${encryptedMockToken}', 'mock');
    `);

    // 2. Invoke Orchestrator API (Intent Parsing)
    let planResCode = 0;
    let planResBody: any = null;

    const planReq = {
      method: "POST",
      body: {
        prompt: "Echo hello world",
        user_id: "user_loop_1",
      },
    } as any;

    const planRes = {
      set: () => {},
      status: (code: number) => { planResCode = code; return planRes; },
      json: (data: any) => { planResBody = data; },
      send: (data: string) => { planResBody = data; },
    } as any;

    await orchestratorHandler(planReq, planRes);

    expect(planResCode).toBe(200);
    expect(planResBody.status).toBe("success");
    expect(planResBody.session_id).toBeDefined();

    const sessionId = planResBody.session_id;
    const manifest = planResBody.pda.plan;
    expect(manifest.skills_required).toContain("echo");

    // 3. Dispatch / Execute
    const results = await executeSwarmManifest(manifest, sessionId, db);

    expect(results["step-echo"]).toBeDefined();
    expect(results["step-echo"].status).toBe("success");

    // 4. Verify Database State
    const dbClientAny = db as any;

    // Check Task Results
    const taskLogs = dbClientAny.db.query("SELECT * FROM task_results WHERE session_id = ?").all(sessionId);
    expect(taskLogs.length).toBe(1);
    expect(taskLogs[0].status).toBe("success");
    expect(taskLogs[0].skill_ref).toBe("echo");

    // Check Audit Logs
    const auditLogs = dbClientAny.db.query("SELECT * FROM audit_log WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
    const auditEvents = auditLogs.map((log: any) => log.event);

    expect(auditEvents).toContain("swarm_execution_started");
    expect(auditEvents).toContain("worker_loading_skill");
    expect(auditEvents).toContain("worker_decrypted_credential");
    expect(auditEvents).toContain("worker_completed");
    expect(auditEvents).toContain("swarm_execution_completed");

    // Verify KMS Credential Decryption Flow
    const decryptLog = auditLogs.find((log: any) => log.event === "worker_decrypted_credential");
    const decryptMeta = JSON.parse(decryptLog.metadata);
    expect(decryptMeta.cred_id).toBe("test_cred");
    expect(decryptMeta.decrypted_value).toBe("[masked]");

    // Check JIT Skill Loaded content
    const skillLoadLog = auditLogs.find((log: any) => log.event === "worker_loading_skill");
    const skillLoadMeta = JSON.parse(skillLoadLog.metadata);
    expect(skillLoadMeta.loaded_content_preview).toContain("Echo Skill");
  });
});
