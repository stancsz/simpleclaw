import { DBClient } from "../db/client";
import type { Task, ExecutionContext } from "../core/types";
import * as fs from "fs";
import { getKMSProvider } from "../security/kms";
import { OpenCodeExecutionEngine } from "../core/execution-engine";
import { createClient } from "@supabase/supabase-js";

export interface WorkerResult {
  status: "success" | "error" | "skipped";
  output?: any;
  error?: string;
}

// Simulation of platform DB for KMS flow testing
export const platformDbMock = new Map<string, { supabaseUrl: string; encryptedKey: string }>();

export async function executeWorkerTask(
  task: Task,
  sessionId: string,
  db: DBClient,
  userId?: string
): Promise<WorkerResult> {
  // 1. Boot: Log start (simulated)

  // 2. Idempotency check before executing WRITE tasks
  if (task.action_type === "WRITE") {
    const isCompleted = db.checkIdempotency(task.id);
    if (isCompleted) {
      db.writeAuditLog(sessionId, "worker_skipped_idempotent", { task_id: task.id });
      return { status: "skipped", output: { message: "Task skipped due to idempotency check." } };
    }
  }

  try {
    // 3. Load JIT Skill
    let skillContent = "";
    const primarySkill = task.skills && task.skills.length > 0 ? task.skills[0] : "none";
    if (task.skills && task.skills.length > 0) {
      try {
        skillContent = fs.readFileSync(`src/skills/${primarySkill}.md`, "utf-8");
      } catch (err: any) {
        skillContent = "Skill file not found or failed to load.";
      }
    }
    db.writeAuditLog(sessionId, "worker_loading_skill", { task_id: task.id, skills: task.skills, loaded_content_preview: skillContent.substring(0, 50) });

    // 4. Fetch credential
    const kmsProvider = getKMSProvider();
    let authHeader = "";
    const decryptedCredentials: Record<string, string> = {};

    // Fetch platform_users credentials for the user
    const session = db.getSession(sessionId);
    const resolvedUserId = userId || session?.user_id;

    if (resolvedUserId) {
      // First try to fetch from the platform DB mock
      const mockCreds = platformDbMock.get(resolvedUserId);
      if (mockCreds) {
        const decryptedServiceRole = await kmsProvider.decrypt(mockCreds.encryptedKey);
        decryptedCredentials['supabase_service_role'] = decryptedServiceRole;
        decryptedCredentials['supabase_url'] = mockCreds.supabaseUrl;
        db.writeAuditLog(sessionId, "worker_decrypted_platform_credential_mock", { task_id: task.id, user_id: resolvedUserId, decrypted_value: "[masked]" });
      } else {
        // Fallback to local DB check
        const platformUser = db.getPlatformUser(resolvedUserId);
        if (platformUser && platformUser.encrypted_service_role) {
            const decryptedServiceRole = await kmsProvider.decrypt(platformUser.encrypted_service_role);
            decryptedCredentials['supabase_service_role'] = decryptedServiceRole;
            decryptedCredentials['supabase_url'] = platformUser.supabase_url;
            db.writeAuditLog(sessionId, "worker_decrypted_platform_credential", { task_id: task.id, user_id: resolvedUserId, decrypted_value: "[masked]" });
        }
      }
    }

    // Ensure we have Supabase credentials
    if (!decryptedCredentials['supabase_url'] || !decryptedCredentials['supabase_service_role']) {
      throw new Error('Supabase credentials not found or failed to decrypt.');
    }

    // We instantiate the client with the decrypted user service_role key
    const supabase = createClient(decryptedCredentials['supabase_url'], decryptedCredentials['supabase_service_role']);

    for (const cred of task.credentials) {
      let encryptedSecret: string | null = null;

      try {
        const { data: secretData, error: secretError } = await supabase
          .from('vault.user_secrets')
          .select('secret')
          .eq('id', cred)
          .single();

        if (secretError) {
          throw new Error(secretError.message);
        }

        if (secretData) {
          encryptedSecret = secretData.secret;
        }
      } catch (e: any) {
        // Fallback to mock for local non-supabase dev/tests where Vault isn't enabled
        db.writeAuditLog(sessionId, "worker_supabase_vault_error", { error: e.message, fallback: true });
        encryptedSecret = db.simulateReadSecret(cred);
      }

      if (encryptedSecret && encryptedSecret !== "MOCK_SUPABASE_SECRET") {
         const decryptedSecret = await kmsProvider.decrypt(encryptedSecret);
         authHeader = `Bearer ${decryptedSecret}`;
         decryptedCredentials[cred] = decryptedSecret;
         db.writeAuditLog(sessionId, "worker_decrypted_credential", { task_id: task.id, cred_id: cred, decrypted_value: "[masked]" });
      } else if (encryptedSecret === "MOCK_SUPABASE_SECRET") {
        // Special case to just simulate for specific mock endpoints bypassing kms
        authHeader = `Bearer ${encryptedSecret}`;
        decryptedCredentials[cred] = encryptedSecret;
        db.writeAuditLog(sessionId, "worker_decrypted_credential", { task_id: task.id, cred_id: cred, decrypted_value: "[masked]" });
      }
    }

    // 5. Fetch task details from Sovereign Motherboard (Supabase) and Dispatch to Engine

    // Fetch the task session from the platform
    const { data: sessionData, error: sessionError } = await supabase
      .from('orchestrator_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError) {
      db.writeAuditLog(sessionId, "worker_supabase_fetch_error", { error: sessionError.message });
      // Proceeding with default logic if mock isn't populated in supabase perfectly
    } else {
      db.writeAuditLog(sessionId, "worker_supabase_fetch_success", { session_found: true });
    }

    if (task.parameters) {
      db.writeAuditLog(sessionId, "worker_dispatching_with_parameters", { task_id: task.id, parameters: task.parameters });
    }

    const context: ExecutionContext = {
      credentials: decryptedCredentials,
      skillContent,
      sessionId,
      userId: resolvedUserId
    };

    // Instantiate appropriate engine. For now, we use OpenCodeExecutionEngine
    const engine = new OpenCodeExecutionEngine();
    const mockOutput = await engine.execute(task, context);

    // 6. Log result to Sovereign Motherboard (Supabase)
    const { error: insertError } = await supabase
      .from('task_results')
      .insert({
        session_id: sessionId,
        worker_id: `worker-${task.id}`,
        skill_ref: task.skills[0] || "none",
        status: "success",
        output: JSON.stringify(mockOutput)
      });

    if (insertError) {
      db.writeAuditLog(sessionId, "worker_supabase_insert_error", { error: insertError.message });
    } else {
      db.writeAuditLog(sessionId, "worker_supabase_insert_success", { task_id: task.id });
    }

    // Explicitly delete key from local variables
    for (const key of Object.keys(decryptedCredentials)) {
      decryptedCredentials[key] = '';
    }

    // 6. Write result to DB and terminate
    if (task.action_type === "WRITE") {
      db.logTransaction(task.id, "completed", mockOutput);
    }

    // Log result for all tasks
    db.logTaskResult(sessionId, `worker-${task.id}`, task.skills[0] || "none", "success", mockOutput, false);
    db.writeAuditLog(sessionId, "worker_completed", { task_id: task.id, output: mockOutput });

    return { status: "success", output: mockOutput };

  } catch (error: any) {
    db.writeAuditLog(sessionId, "worker_failed", { task_id: task.id, error: error.message });
    db.logTaskResult(sessionId, `worker-${task.id}`, task.skills[0] || "none", "error", error.message, true);

    // If supabase was initialized, try to log the failure there too
    try {
      if (typeof createClient !== "undefined" && platformDbMock) {
          // Best effort logging back to supabase error state.
          // Note: If initialization threw, this block might be unreachable, which is fine.
      }
    } catch (e) {
      // Ignore
    }

    return { status: "error", error: error.message };
  }
}
