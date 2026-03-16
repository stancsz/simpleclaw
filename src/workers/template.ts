import { DBClient } from "../db/client.ts";
import type { Task } from "../core/types.ts";

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
    // 3. Load JIT Skill (Mock)
    db.writeAuditLog(sessionId, "worker_loading_skill", { task_id: task.id, skills: task.skills });

    // 4. Fetch credential (Mock)
    for (const cred of task.credentials) {
      db.simulateReadSecret(cred);
    }

    // 5. Execute (Mock task)
    // Simulating execution delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    const mockOutput = {
      message: `Executed task ${task.id}: ${task.description}`,
      skills_used: task.skills,
    };

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
