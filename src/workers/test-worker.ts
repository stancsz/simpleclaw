import { DBClient } from "../db/client";
import type { Task } from "../core/types";
import type { WorkerResult } from "./template";

export async function executeTestWorkerTask(
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
    // 2. Load JIT Skill (simulated)
    let skillContent = "";
    if (task.skills && task.skills.length > 0) {
      skillContent = `Simulated content for skill: ${task.skills[0]}`;
    }
    db.writeAuditLog(sessionId, "worker_loading_skill", {
      task_id: task.id,
      skills: task.skills,
      loaded_content_preview: skillContent.substring(0, 50)
    });

    // 3. Simulate execution based on task parameters
    // If a task requires simulating a failure, we look for a specific flag in parameters
    if (task.parameters?.simulate_failure) {
      throw new Error(`Simulated worker failure: ${task.parameters.error_message || "Unknown error"}`);
    }

    let mockOutput: any = {
      message: `Executed test task ${task.id}: ${task.description}`,
      skills_used: task.skills,
      action_type: task.action_type
    };

    // Simulate API delay if requested
    if (task.parameters?.delay_ms) {
       await new Promise(resolve => setTimeout(resolve, task.parameters!.delay_ms));
    }

    // 4. Write result to DB and terminate
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
