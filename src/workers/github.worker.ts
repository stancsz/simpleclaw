
import { DBClient } from "../db/client";
import type { Task } from "../core/types";
import type { WorkerResult } from "./template";
import { getKMSProvider } from "../security/kms";

export async function executeGithubWorkerTask(
  task: Task,
  sessionId: string,
  db: DBClient
): Promise<WorkerResult> {
  // 1. Idempotency check before WRITE
  if (task.action_type === "WRITE") {
    const isCompleted = db.checkIdempotency(task.id);
    if (isCompleted) {
      db.writeAuditLog(sessionId, "worker_skipped_idempotent", { task_id: task.id });
      return { status: "skipped", output: { message: "Task skipped due to idempotency check." } };
    }
  }

  try {
    // 2. Load JIT Skill
    let skillContent = "";
    if (task.skills && task.skills.length > 0) {
      try {
        // Read from src/skills instead of src/workers/skills as requested in the prompt
        skillContent = await Bun.file(`src/skills/${task.skills[0]}.md`).text();
      } catch (err: any) {
        skillContent = "Skill file not found or failed to load.";
      }
    }
    db.writeAuditLog(sessionId, "worker_loading_skill", { task_id: task.id, skills: task.skills, loaded_content_preview: skillContent.substring(0, 50) });

    // 3. Fetch credential
    const kmsProvider = getKMSProvider();
    let authHeader = "";
    for (const cred of task.credentials) {
      const encryptedSecret = db.simulateReadSecret(cred);
      if (encryptedSecret && encryptedSecret !== "MOCK_SUPABASE_SECRET") {
         const decryptedSecret = await kmsProvider.decrypt(encryptedSecret);
         authHeader = `Bearer ${decryptedSecret}`;
         db.writeAuditLog(sessionId, "worker_decrypted_credential", { task_id: task.id, cred_id: cred });
      }
    }

    if (!authHeader) {
        throw new Error("Missing GitHub credentials. Cannot execute API call.");
    }

    // 4. Execute actual GitHub API call
    let mockOutput: any = {
      message: `Executed task ${task.id}: ${task.description}`,
      skills_used: task.skills,
    };

    // By default for this worker, do a GET /user to validate auth, unless specified otherwise in task
    // We'll extract a target URL from the task description if it exists, otherwise default to /user
    let targetEndpoint = "https://api.github.com/user";
    if (task.description && task.description.includes("repos")) {
        targetEndpoint = "https://api.github.com/user/repos";
    }

    const res = await fetch(targetEndpoint, {
        headers: {
            "Authorization": authHeader,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "SimpleClaw-Worker"
        }
    });

    const responseJson = await res.json();

    if (!res.ok) {
        throw new Error(`GitHub API Error: ${res.status} ${res.statusText} - ${JSON.stringify(responseJson)}`);
    }

    mockOutput.api_response = responseJson;

    // 5. Write result to DB and terminate
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
