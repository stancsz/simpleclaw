import { DBClient } from "../db/client";
import type { Task } from "../core/types";
import { WorkerResult } from "./template";

export async function executeTestWorkerTask(
  task: Task,
  sessionId: string,
  db: DBClient
): Promise<WorkerResult> {
  db.writeAuditLog(sessionId, "worker_test_started", { task_id: task.id, message: "Test worker starting" });

  console.log(`[TestWorker] Starting task ${task.id}... sleeping for 2 seconds.`);

  // Simulate work
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const output = {
    message: `Test worker executed successfully for task ${task.id}`,
    taskDetails: task.description,
  };

  db.logTaskResult(sessionId, `worker-${task.id}`, task.skills?.[0] || "none", "success", output, false);
  db.writeAuditLog(sessionId, "worker_test_completed", { task_id: task.id, output });

  console.log(`[TestWorker] Completed task ${task.id}.`);

  return {
    status: "success",
    output,
  };
}
