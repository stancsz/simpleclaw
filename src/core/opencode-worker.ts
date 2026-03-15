import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CapabilityExecutionContext, CapabilityResult } from "./capabilities.ts";

const execFileAsync = promisify(execFile);
const DEFAULT_DELEGATION_SCOPE = "worker:opencode";
const DEFAULT_RETRY_BUDGET = 1;

/**
 * opencode-worker.ts
 * 
 * Sub-agent implementation for OpenCode.
 * This is a prime example of SimpleClaw's Meta-Orchestration model:
 * The core orchestrator delegates "heavy lifting" (coding, CLI work) to this sub-agent engine.
 */
export interface OpenCodeDelegationTask {
  objective: string;
  scope?: string[];
  constraints?: string[];
  acceptanceCriteria?: string[];
  retryBudget?: number;
}

export interface OpenCodeDelegationResult {
  summary: string;
  status: "completed" | "blocked" | "partial";
  touchedFiles: string[];
  verificationNotes: string[];
  rawOutput?: string;
}

function sanitizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function normalizeTask(args: Record<string, unknown>): OpenCodeDelegationTask {
  return {
    objective: typeof args.objective === "string" ? args.objective : "",
    scope: sanitizeStringList(args.scope),
    constraints: sanitizeStringList(args.constraints),
    acceptanceCriteria: sanitizeStringList(args.acceptanceCriteria),
    retryBudget:
      typeof args.retryBudget === "number" && Number.isFinite(args.retryBudget)
        ? Math.max(0, Math.min(args.retryBudget, DEFAULT_RETRY_BUDGET))
        : DEFAULT_RETRY_BUDGET,
  };
}

function buildInstruction(task: OpenCodeDelegationTask): string {
  const sections = [
    `Objective: ${task.objective}`,
    task.scope && task.scope.length > 0 ? `Scope:\n- ${task.scope.join("\n- ")}` : "Scope:\n- Use repository context only where needed",
    task.constraints && task.constraints.length > 0 ? `Constraints:\n- ${task.constraints.join("\n- ")}` : "Constraints:\n- Keep changes minimal and safe",
    task.acceptanceCriteria && task.acceptanceCriteria.length > 0
      ? `Acceptance criteria:\n- ${task.acceptanceCriteria.join("\n- ")}`
      : "Acceptance criteria:\n- Report completion or blocker clearly",
    "Return JSON with keys: summary, status, touchedFiles, verificationNotes.",
  ];

  return sections.join("\n\n");
}

function parseWorkerOutput(stdout: string, stderr: string): OpenCodeDelegationResult {
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<OpenCodeDelegationResult>;
      return {
        summary: parsed.summary || "OpenCode completed work.",
        status: parsed.status === "blocked" || parsed.status === "partial" ? parsed.status : "completed",
        touchedFiles: Array.isArray(parsed.touchedFiles) ? parsed.touchedFiles.filter((value): value is string => typeof value === "string") : [],
        verificationNotes: Array.isArray(parsed.verificationNotes)
          ? parsed.verificationNotes.filter((value): value is string => typeof value === "string")
          : stderr.trim()
            ? [stderr.trim()]
            : [],
        rawOutput: trimmed,
      };
    } catch {
      return {
        summary: trimmed,
        status: "partial",
        touchedFiles: [],
        verificationNotes: stderr.trim() ? [stderr.trim()] : [],
        rawOutput: trimmed,
      };
    }
  }

  return {
    summary: stderr.trim() || "OpenCode returned no output.",
    status: "blocked",
    touchedFiles: [],
    verificationNotes: stderr.trim() ? [stderr.trim()] : [],
    rawOutput: stderr.trim(),
  };
}

async function findOpenCodeCommand(): Promise<{ command: string; args: string[] }> {
  const envCommand = process.env.SIMPLECLAW_OPENCODE_COMMAND;
  if (envCommand) {
    const args = (process.env.SIMPLECLAW_OPENCODE_ARGS || "run --format json").split(/\s+/).filter(Boolean);
    return { command: envCommand, args };
  }

  try {
    const { execSync } = await import("node:child_process");
    execSync("opencode --version", { stdio: "ignore" });
    return { command: "opencode", args: ["run", "--format", "json"] };
  } catch {
    // Fallback to npx
    return { command: "npx", args: ["-y", "opencode-ai", "run", "--format", "json"] };
  }
}

async function runOpenCodeTask(task: OpenCodeDelegationTask, emit?: (event: any) => void): Promise<OpenCodeDelegationResult> {
  const { command, args } = await findOpenCodeCommand();
  const finalArgs = [...args];
  
  // Try to pass the model if configured
  const model = process.env.AGENT_MODEL;
  if (model && !finalArgs.includes("-m") && !finalArgs.includes("--model")) {
      // Note: opencode usually expects provider/model but we'll try passing it directly
      // as deepseek-chat if it's deepseek
      finalArgs.push("-m", model);
  }

  if (command === "npx") {
    emit?.({ type: "iterationProgress", message: "🚀 opencode not found locally. Using dynamic setup via npx..." });
  }

  const { stdout, stderr } = await execFileAsync(command, [...finalArgs, buildInstruction(task)], {
    cwd: process.cwd(),
    env: process.env,
  });

  return parseWorkerOutput(stdout, stderr);
}

function summarizeResult(result: OpenCodeDelegationResult): string {
  const parts = [result.summary];
  if (result.touchedFiles.length > 0) {
    parts.push(`Touched files: ${result.touchedFiles.join(", ")}`);
  }
  if (result.verificationNotes.length > 0) {
    parts.push(`Verification: ${result.verificationNotes.join(" | ")}`);
  }
  return parts.join("\n");
}

export async function delegateToOpenCode(
  args: Record<string, unknown>,
  context: CapabilityExecutionContext,
): Promise<CapabilityResult> {
  const task = normalizeTask(args);
  if (!task.objective.trim()) {
    return {
      status: "blocked",
      content: "DELEGATION_ERROR: objective is required",
    };
  }

  const scope = `${DEFAULT_DELEGATION_SCOPE}:${context.runtime.source ?? "unknown"}`;
  const dedupeKey = JSON.stringify({ objective: task.objective, scope: task.scope ?? [] });
  const maxAttempts = 1 + (task.retryBudget ?? DEFAULT_RETRY_BUDGET);
  let attempts = 0;
  let lastResult: OpenCodeDelegationResult | undefined;

  while (attempts < maxAttempts) {
    attempts += 1;
    await context.runtime.emitRuntimeEvent?.({
      type: "workerDelegationStarted",
      taskId: `delegate:${attempts}`,
      source: context.runtime.source ?? "unknown",
      scope,
      worker: "opencode",
      objective: task.objective,
      attempt: attempts,
    });

    await context.runtime.dispatcher.submit({
      source: "delegate:opencode",
      scope,
      prompt: `Delegate coding task to OpenCode: ${task.objective}`,
      dedupeKey,
      maxIterations: 1,
      onEvent: context.runtime.emitRuntimeEvent,
      metadata: { worker: "opencode", attempt: attempts },
    });

    try {
      lastResult = await runOpenCodeTask(task, (event) => context.runtime.emitRuntimeEvent?.(event));
      await context.runtime.emitRuntimeEvent?.({
        type: "workerDelegationCompleted",
        taskId: `delegate:${attempts}`,
        source: context.runtime.source ?? "unknown",
        scope,
        worker: "opencode",
        status: lastResult.status,
        summary: lastResult.summary,
        attempt: attempts,
      });

      if (lastResult.status === "completed" || attempts >= maxAttempts) {
        break;
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      lastResult = {
        summary: message,
        status: "blocked",
        touchedFiles: [],
        verificationNotes: [message],
      };
      await context.runtime.emitRuntimeEvent?.({
        type: "workerDelegationCompleted",
        taskId: `delegate:${attempts}`,
        source: context.runtime.source ?? "unknown",
        scope,
        worker: "opencode",
        status: "blocked",
        summary: message,
        attempt: attempts,
      });
      break;
    }
  }

  return {
    status: lastResult?.status ?? "blocked",
    content: summarizeResult(
      lastResult ?? {
        summary: "OpenCode did not return a result.",
        status: "blocked",
        touchedFiles: [],
        verificationNotes: [],
      },
    ),
    data: lastResult,
  };
}
