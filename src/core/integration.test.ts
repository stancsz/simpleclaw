import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client.ts";
import { executeSwarmManifest } from "./dispatcher.ts";
import type { SwarmManifest } from "./types.ts";
import * as fs from "fs";
import { getKMSProvider } from "../security/kms.ts";

describe("Swarm End-to-End Integration", () => {
  let db: DBClient;

  beforeEach(() => {
    // Set up Local KMS provider specifically for tests
    process.env.KMS_PROVIDER = "local";

    // Create an in-memory DB and run migrations
    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);
  });

  afterEach(() => {
    delete process.env.KMS_PROVIDER;
  });

  it("should successfully execute a full swarm manifest with test-api skill and KMS credential decryption", async () => {
    // 1. Prepare KMS Credential
    const kmsProvider = getKMSProvider();
    const rawSecret = "super_secret_test_key_123";
    const encryptedSecret = await kmsProvider.encrypt(rawSecret);

    // 2. Insert into local mock database via applyMigration raw query
    // This seeds the credential that the worker should fetch and decrypt.
    db.applyMigration(`
      INSERT INTO vault_user_secrets (id, name, secret)
      VALUES ('test_api_key', 'Test API Key', '${encryptedSecret}');
    `);

    // 3. Define the DAG Manifest
    const manifest: SwarmManifest = {
      version: "1.0",
      intent_parsed: "Test end-to-end API execution with KMS",
      skills_required: ["test-api"],
      credentials_required: ["test_api_key"],
      steps: [
        {
          id: "e2e-task-1",
          description: "Fetch JSONPlaceholder post 1",
          worker: "worker-e2e",
          skills: ["test-api"],
          credentials: ["test_api_key"],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };

    // 4. Dispatch the Swarm execution
    const sessionId = "e2e-session-id";
    const results = await executeSwarmManifest(manifest, sessionId, db);

    // 5. Assert the worker succeeded
    expect(results["e2e-task-1"]).toBeDefined();
    expect(results["e2e-task-1"].status).toBe("success");
    expect(results["e2e-task-1"].error).toBeUndefined();

    // 6. Assert the API response was successfully mapped
    const output = results["e2e-task-1"].output;
    expect(output).toBeDefined();
    expect(output.api_response).toBeDefined();

    // Confirm the API structure matches JSONPlaceholder expectations
    expect(output.api_response.id).toBe(1);
    expect(output.api_response.userId).toBe(1);
    expect(typeof output.api_response.title).toBe("string");

    // 7. Assert database task results were written
    const dbClientAny = db as any; // Inspect private property for test assertions
    const taskLogs = dbClientAny.db.query("SELECT * FROM task_results WHERE session_id = 'e2e-session-id'").all();

    expect(taskLogs.length).toBe(1);
    expect(taskLogs[0].status).toBe("success");
    expect(taskLogs[0].worker_id).toBe("worker-e2e-task-1");

    // 8. Assert audit logs confirm JIT skill loading and decrypting
    const auditLogs = dbClientAny.db.query("SELECT * FROM audit_log WHERE session_id = 'e2e-session-id' ORDER BY created_at ASC").all();

    const auditEvents = auditLogs.map((log: any) => log.event);
    expect(auditEvents).toContain("swarm_execution_started");
    expect(auditEvents).toContain("worker_loading_skill");
    expect(auditEvents).toContain("worker_decrypted_credential");
    expect(auditEvents).toContain("worker_completed");
    expect(auditEvents).toContain("swarm_execution_completed");

    // Check that the skill file was actually loaded by examining the preview content in metadata
    const skillLoadLog = auditLogs.find((log: any) => log.event === "worker_loading_skill");
    const skillLoadMeta = JSON.parse(skillLoadLog.metadata);
    expect(skillLoadMeta.loaded_content_preview).toContain("test-api");

    // Check that the credential was successfully decrypted and matches the original plaintext
    const decryptLog = auditLogs.find((log: any) => log.event === "worker_decrypted_credential");
    const decryptMeta = JSON.parse(decryptLog.metadata);
    expect(decryptMeta.cred_id).toBe("test_api_key");
    expect(decryptMeta.decrypted_value).toBe("super_secret_test_key_123");
  });
});
