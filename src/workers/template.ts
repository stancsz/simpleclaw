import { DBClient } from "../db/client";
import type { Task } from "../core/types";
import * as fs from "fs";
import { getKMSProvider } from "../security/kms";

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
    if (task.skills && task.skills.length > 0) {
      try {
        skillContent = fs.readFileSync(`src/workers/skills/${task.skills[0]}.md`, "utf-8");
      } catch (err: any) {
        skillContent = "Skill file not found or failed to load.";
      }
    }
    db.writeAuditLog(sessionId, "worker_loading_skill", { task_id: task.id, skills: task.skills, loaded_content_preview: skillContent.substring(0, 50) });

    // 4. Fetch credential
    const kmsProvider = getKMSProvider();
    let authHeader = "";
    for (const cred of task.credentials) {
      const encryptedSecret = db.simulateReadSecret(cred);
      if (encryptedSecret && encryptedSecret !== "MOCK_SUPABASE_SECRET") {
         const decryptedSecret = await kmsProvider.decrypt(encryptedSecret);
         authHeader = `Bearer ${decryptedSecret}`;
         db.writeAuditLog(sessionId, "worker_decrypted_credential", { task_id: task.id, cred_id: cred, decrypted_value: decryptedSecret });
      }
    }

    // 5. Execute (Mock task or real test-api logic)
    // Simulating execution delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    let mockOutput: any = {
      message: `Executed task ${task.id}: ${task.description}`,
      skills_used: task.skills,
    };

    if (task.skills && task.skills[0] === "test-api") {
      const res = await fetch("https://jsonplaceholder.typicode.com/posts/1", {
          headers: authHeader ? { Authorization: authHeader } : undefined
      });
      mockOutput.api_response = await res.json();
    }

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
