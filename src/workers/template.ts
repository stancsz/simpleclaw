import { DBClient } from "../db/client";
import type { Task } from "../core/types";
import * as fs from "fs";
import { getKMSProvider } from "../security/kms";
import { executeEngine } from "../core/engine";

export interface WorkerResult {
  status: "success" | "error" | "skipped";
  output?: any;
  error?: string;
}

export async function executeWorkerTask(
  task: Task,
  sessionId: string,
  db: DBClient
): Promise<WorkerResult> {
  // 1. Boot: Log start (simulated)

  // 2. Idempotency check before WRITE
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
        skillContent = fs.readFileSync(`src/workers/skills/${primarySkill}.md`, "utf-8");
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
    if (session && session.user_id) {
        const platformUser = db.getPlatformUser(session.user_id);
        if (platformUser && platformUser.encrypted_service_role) {
            const decryptedServiceRole = await kmsProvider.decrypt(platformUser.encrypted_service_role);
            decryptedCredentials['supabase_service_role'] = decryptedServiceRole;
            decryptedCredentials['supabase_url'] = platformUser.supabase_url;
            db.writeAuditLog(sessionId, "worker_decrypted_platform_credential", { task_id: task.id, user_id: session.user_id, decrypted_value: "[masked]" });
        }
    }

    for (const cred of task.credentials) {
      const encryptedSecret = db.simulateReadSecret(cred);
      if (encryptedSecret && encryptedSecret !== "MOCK_SUPABASE_SECRET") {
         const decryptedSecret = await kmsProvider.decrypt(encryptedSecret);
         authHeader = `Bearer ${decryptedSecret}`;
         decryptedCredentials[cred] = decryptedSecret;
         db.writeAuditLog(sessionId, "worker_decrypted_credential", { task_id: task.id, cred_id: cred, decrypted_value: "[masked]" });
      }
    }

    // 5. Dispatch to Engine
    if (task.parameters) {
      db.writeAuditLog(sessionId, "worker_dispatching_with_parameters", { task_id: task.id, parameters: task.parameters });
    }
    const mockOutput = await executeEngine(primarySkill, decryptedCredentials, task);

    // 6. Write result to DB and terminate
    if (task.action_type === "WRITE") {
      db.logTransaction(task.id, "completed", mockOutput);
    }

    // Log result for all tasks
    db.logTaskResult(sessionId, `worker-${task.id}`, task.skills[0] || "none", "success", mockOutput, false);
    db.writeAuditLog(sessionId, "worker_completed", { task_id: task.id });

    return { status: "success", output: mockOutput };

  } catch (error: any) {
    db.writeAuditLog(sessionId, "worker_failed", { task_id: task.id, error: error.message });
    db.logTaskResult(sessionId, `worker-${task.id}`, task.skills[0] || "none", "error", error.message, true);

    return { status: "error", error: error.message };
  }
}
