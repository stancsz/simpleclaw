
import { randomUUID } from "node:crypto";
import type { SwarmManifest, Task } from "./types";
import { DBClient } from "../db/client";
import { executeWorkerTask, type WorkerResult } from "../workers/template";
import { executeGithubWorkerTask } from "../workers/github.worker";
import { executeMockWorkerTask } from "../workers/mock-worker";
import { executeDemoWorkerTask } from "../workers/demo-worker";

import {
  runAgentLoop,
  type AgentEvent,
  type AgentLoopResult,
  type AgentOptions,
  type ConversationMessage,
} from "./agent";

export interface AgentDispatchSubmitInput {
  source: string;
  prompt: string;
  scope: string;
  history?: ConversationMessage[];
  model?: string;
  maxIterations?: number;
  metadata?: Record<string, unknown>;
  onEvent?: (event: RuntimeDispatchEvent) => Promise<void> | void;
  dedupeKey?: string;
}

export type WorkerDelegationStatus = "completed" | "blocked" | "partial";

export type WorkerDispatchEvent =
  | {
      type: "workerDelegationStarted";
      taskId: string;
      source: string;
      scope: string;
      worker: string;
      objective: string;
      attempt: number;
    }
  | {
      type: "workerDelegationCompleted";
      taskId: string;
      source: string;
      scope: string;
      worker: string;
      status: WorkerDelegationStatus;
      summary: string;
      attempt: number;
    };

export type PolicyDispatchEvent =
  | {
      type: "capabilityUnknown";
      taskId: string;
      source: string;
      scope: string;
      capabilityName: string;
      reason: string;
    }
  | {
      type: "capabilityDisabled";
      taskId: string;
      source: string;
      scope: string;
      capabilityName: string;
      reason: string;
    }
  | {
      type: "capabilityDenied";
      taskId: string;
      source: string;
      scope: string;
      capabilityName: string;
      reason: string;
    };

export type DispatchTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface DispatchTaskSnapshot {
  id: string;
  source: string;
  scope: string;
  prompt: string;
  status: DispatchTaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: Error;
  dedupeKey?: string;
}

export interface DispatchTaskHandle extends DispatchTaskSnapshot {
  promise: Promise<AgentLoopResult>;
  cancel: () => boolean;
}

interface InternalDispatchTaskHandle extends DispatchTaskHandle {
  cancelRequested: boolean;
}

export type RuntimeDispatchEvent =
  | { type: "taskQueued"; taskId: string; source: string; scope: string; prompt: string }
  | { type: "taskStarted"; taskId: string; source: string; scope: string; prompt: string }
  | { type: "taskCompleted"; taskId: string; source: string; scope: string; result: AgentLoopResult }
  | { type: "taskFailed"; taskId: string; source: string; scope: string; error: Error }
  | { type: "taskCancelled"; taskId: string; source: string; scope: string; reason: string }
  | { type: "taskDeduped"; taskId: string; source: string; scope: string; dedupeKey: string }
  | WorkerDispatchEvent
  | PolicyDispatchEvent
  | ({ taskId: string; source: string; scope: string } & AgentEvent);

export interface AgentDispatcher {
  submit: (input: AgentDispatchSubmitInput) => Promise<AgentLoopResult>;
  getInFlightTasks: () => DispatchTaskHandle[];
  getTaskSnapshots: () => DispatchTaskSnapshot[];
  cancelTask: (taskId: string) => boolean;
  hasConflictingTask: (scope: string, dedupeKey?: string) => boolean;
}

export type AgentLoopRunner = (
  userMessage: string,
  options?: AgentOptions,
  history?: ConversationMessage[],
) => Promise<AgentLoopResult>;

export interface AgentDispatcherDependencies {
  runAgentLoop?: AgentLoopRunner;
}

interface ScopeQueueState {
  tail: Promise<unknown>;
}

function createCancelledResult(history: ConversationMessage[] = []): AgentLoopResult {
  return {
    content: "",
    iterations: 0,
    messages: history,
    completed: false,
  };
}

export function createAgentDispatcher(dependencies: AgentDispatcherDependencies = {}): AgentDispatcher {
  const agentLoopRunner = dependencies.runAgentLoop ?? runAgentLoop;
  const scopeQueues = new Map<string, ScopeQueueState>();
  const taskHandles = new Map<string, InternalDispatchTaskHandle>();
  const activeDedupeKeys = new Set<string>();

  const emit = async (
    input: AgentDispatchSubmitInput,
    event: RuntimeDispatchEvent,
  ): Promise<void> => {
    await input.onEvent?.(event);
  };

  const hasConflictingTask = (scope: string, dedupeKey?: string) => {
    if (dedupeKey && activeDedupeKeys.has(`${scope}:${dedupeKey}`)) {
      return true;
    }

    return Array.from(taskHandles.values()).some(
      (task) => (task.status === "queued" || task.status === "running") && task.scope === scope,
    );
  };

  return {
    submit: async (input) => {
      const taskId = randomUUID();
      const dedupeToken = input.dedupeKey ? `${input.scope}:${input.dedupeKey}` : undefined;
      const createdAt = Date.now();

      if (dedupeToken && activeDedupeKeys.has(dedupeToken)) {
        await emit(input, {
          type: "taskDeduped",
          taskId,
          source: input.source,
          scope: input.scope,
          dedupeKey: input.dedupeKey!,
        });
        return createCancelledResult(input.history ?? []);
      }

      if (dedupeToken) {
        activeDedupeKeys.add(dedupeToken);
      }

      const scopeState = scopeQueues.get(input.scope) ?? { tail: Promise.resolve() };
      scopeQueues.set(input.scope, scopeState);

      let handle!: InternalDispatchTaskHandle;

      const run = async (): Promise<AgentLoopResult> => {
        if (handle.cancelRequested) {
          handle.status = "cancelled";
          handle.completedAt = Date.now();
          await emit(input, {
            type: "taskCancelled",
            taskId,
            source: input.source,
            scope: input.scope,
            reason: "cancelled before execution",
          });
          return createCancelledResult(input.history ?? []);
        }

        handle.status = "running";
        handle.startedAt = Date.now();

        await emit(input, {
          type: "taskStarted",
          taskId,
          source: input.source,
          scope: input.scope,
          prompt: input.prompt,
        });

        const agentOptions: AgentOptions = {
          model: input.model,
          maxIterations: input.maxIterations,
          source: input.source,
          emitEvent: async (event) => {
            await emit(input, {
              ...event,
              taskId,
              source: input.source,
              scope: input.scope,
            });
          },
          onIteration: async (message) => {
            await emit(input, {
              type: "iterationProgress",
              iteration: 0,
              message,
              taskId,
              source: input.source,
              scope: input.scope,
            });
          },
        };

        try {
          const result = await agentLoopRunner(input.prompt, agentOptions, input.history ?? []);
          handle.status = "completed";
          handle.completedAt = Date.now();
          await emit(input, {
            type: "taskCompleted",
            taskId,
            source: input.source,
            scope: input.scope,
            result,
          });
          return result;
        } catch (error: any) {
          const normalizedError = error instanceof Error ? error : new Error(String(error));
          handle.status = "failed";
          handle.error = normalizedError;
          handle.completedAt = Date.now();
          await emit(input, {
            type: "taskFailed",
            taskId,
            source: input.source,
            scope: input.scope,
            error: normalizedError,
          });
          throw normalizedError;
        } finally {
          if (dedupeToken) {
            activeDedupeKeys.delete(dedupeToken);
          }
        }
      };

      await emit(input, {
        type: "taskQueued",
        taskId,
        source: input.source,
        scope: input.scope,
        prompt: input.prompt,
      });

      const promise = scopeState.tail.then(run, run);
      scopeState.tail = promise.then(
        () => undefined,
        () => undefined,
      );

      handle = {
        id: taskId,
        source: input.source,
        scope: input.scope,
        prompt: input.prompt,
        status: "queued",
        createdAt,
        dedupeKey: input.dedupeKey,
        promise,
        cancelRequested: false,
        cancel: () => {
          if (handle.status !== "queued") {
            return false;
          }
          handle.cancelRequested = true;
          return true;
        },
      };

      taskHandles.set(taskId, handle);

      try {
        return await promise;
      } finally {
        if (handle.status === "queued" || handle.status === "running") {
          handle.status = "cancelled";
          handle.completedAt = Date.now();
        }
      }
    },
    getInFlightTasks: () =>
      Array.from(taskHandles.values()).filter(
        (task) => task.status === "queued" || task.status === "running",
      ),
    getTaskSnapshots: () =>
      Array.from(taskHandles.values()).map(({ promise, cancel, cancelRequested, ...snapshot }) => snapshot),
    cancelTask: (taskId) => {
      const handle = taskHandles.get(taskId);
      return handle ? handle.cancel() : false;
    },
    hasConflictingTask,
  };
}


export async function executeSwarmManifest(
  manifest: SwarmManifest,
  sessionId: string,
  db: DBClient
): Promise<Record<string, WorkerResult>> {
  if (!manifest) {
    db.writeAuditLog(sessionId, "swarm_execution_failed", { error: "Manifest is undefined" });
    db.updateSessionStatus(sessionId, "error");
    return { error: { status: "error", error: "Manifest is undefined" } };
  }

  const tasks = manifest.steps || [];
  const results: Record<string, WorkerResult> = {};

  db.writeAuditLog(sessionId, "swarm_execution_started", { manifest_version: manifest.version || "unknown" });

  // 1. Build Adjacency List and In-Degree Map
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const taskMap = new Map<string, Task>();

  for (const task of tasks) {
    adjList.set(task.id, []);
    inDegree.set(task.id, 0);
    taskMap.set(task.id, task);
  }

  for (const task of tasks) {
    for (const dep of task.depends_on || []) {
      if (!taskMap.has(dep)) {
        const errorMsg = `Invalid dependency: Task ${task.id} depends on non-existent task ${dep}`;
        db.writeAuditLog(sessionId, "swarm_execution_failed", { error: errorMsg });
        db.updateSessionStatus(sessionId, "error");
        return { error: { status: "error", error: errorMsg } };
      }
      adjList.get(dep)!.push(task.id);
      inDegree.set(task.id, inDegree.get(task.id)! + 1);
    }
  }

  // 2. Topological Sort / Cycle Detection
  const queue: string[] = [];
  for (const [taskId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(taskId);
    }
  }

  let visitedCount = 0;
  // We use this just to check for cycles before execution
  const tempQueue = [...queue];
  const tempInDegree = new Map(inDegree);
  while (tempQueue.length > 0) {
    const current = tempQueue.shift()!;
    visitedCount++;
    for (const neighbor of adjList.get(current)!) {
      tempInDegree.set(neighbor, tempInDegree.get(neighbor)! - 1);
      if (tempInDegree.get(neighbor) === 0) {
        tempQueue.push(neighbor);
      }
    }
  }

  if (visitedCount !== tasks.length) {
    const errorMsg = "Cycle detected in DAG dependencies";
    db.writeAuditLog(sessionId, "swarm_execution_failed", { error: errorMsg });
    db.updateSessionStatus(sessionId, "error");
    return { error: { status: "error", error: errorMsg } };
  }

  // 3. Execution Setup
  const executionPromises = new Map<string, Promise<WorkerResult>>();
  const deferredResolvers = new Map<string, { resolve: (val: WorkerResult) => void, reject: (err: any) => void }>();

  for (const task of tasks) {
    const promise = new Promise<WorkerResult>((resolve, reject) => {
      deferredResolvers.set(task.id, { resolve, reject });
    });
    executionPromises.set(task.id, promise);
  }

  // Helper to execute a single task with timeout
  const runTaskWithTimeout = async (task: Task): Promise<WorkerResult> => {
    try {
      if (task.depends_on && task.depends_on.length > 0) {
        const depPromises = task.depends_on.map((depId) => executionPromises.get(depId)!);
        const depResults = await Promise.all(depPromises);

        for (const res of depResults) {
          if (res.status === "error") {
            db.writeAuditLog(sessionId, "worker_skipped_dependency_failed", { task_id: task.id });
            const skipResult: WorkerResult = { status: "error", error: `Dependency failed, skipping ${task.id}` };
            results[task.id] = skipResult;
            deferredResolvers.get(task.id)?.resolve(skipResult);
            return skipResult;
          }
        }
      }

      const executeOnce = async (): Promise<WorkerResult> => {
        const result = await executeWorkerTask(task, sessionId, db);

        if (result.status === "error") {
            throw new Error(result.error || "Worker task returned error status");
        }
        return result;
      };

      const executeWithTimeout = async (): Promise<WorkerResult> => {
        const timeoutMs = task.timeout || 30000; // Use task timeout or 30 seconds default
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<WorkerResult>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Task execution timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        try {
          const res = await Promise.race([executeOnce(), timeoutPromise]);
          clearTimeout(timeoutId!);
          return res;
        } catch (error) {
          clearTimeout(timeoutId!);
          throw error;
        }
      };

      let finalResult: WorkerResult;
      try {
        finalResult = await executeWithTimeout();
      } catch (firstError: any) {
         db.writeAuditLog(sessionId, "worker_retry_attempt", { task_id: task.id, error: firstError.message });
         try {
           finalResult = await executeWithTimeout();
         } catch (retryError: any) {
           finalResult = { status: "error", error: retryError.message || String(retryError) };
         }
      }

      results[task.id] = finalResult;

      deferredResolvers.get(task.id)?.resolve(finalResult);
      return finalResult;
    } catch (error: any) {
       const errResult: WorkerResult = { status: "error", error: error.message || String(error) };
       results[task.id] = errResult;

       deferredResolvers.get(task.id)?.resolve(errResult);
       return errResult;
    }
  };

  // 4. Start all tasks (they wait for dependencies via promises internally)
  for (const task of tasks) {
     runTaskWithTimeout(task);
  }

  // Wait for all tasks to complete
  await Promise.allSettled(Array.from(executionPromises.values()));

  db.writeAuditLog(sessionId, "swarm_execution_completed", { tasks_run: tasks.length, results_summary: Object.keys(results) });

  // If any task failed, mark session as error, else completed
  const hasErrors = Object.values(results).some(res => res.status === "error");

  if (hasErrors) {
      db.updateSessionStatus(sessionId, "error");
  } else {
      db.updateSessionStatus(sessionId, "completed");

      // Debit 1 Gas Credit after successful execution
      const session = db.getSession(sessionId);
      if (session && session.user_id) {
          db.decrementGasBalance(session.user_id, 1);
      }
  }

  return results;
}
