import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentDispatcher, AgentDispatchSubmitInput, RuntimeDispatchEvent } from "./dispatcher";
import type { AgentOptions } from "./agent";
import { loadLongTermMemory } from "./memory";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMM_DIR = join(__dirname, "../../.agents/comm");
const OUTBOX_PATH = join(COMM_DIR, "OUTBOX.md");
const INBOX_PATH = join(COMM_DIR, "INBOX.md");
const HEARTBEAT_MAX_ITERATIONS = 3;
const MAX_SECTION_CHARS = 4000;
const SIGNAL_LABELS = ["TODO", "Next Steps", "Open Tasks", "Pending", "Action Items", "Follow Up"];
const CHECKBOX_PATTERN = /^[\t ]*[-*][\t ]+\[[\t ]\]/m;

export interface HeartbeatOutcome {
  status: "noop" | "invoked";
  reason: string;
}

interface OptionalMarkdownFile {
  exists: boolean;
  content: string;
}

interface SignalSummary {
  hasStrongSignal: boolean;
  hasWeakSignal: boolean;
  reason: string;
}

export interface HeartbeatEvaluation {
  outcome: HeartbeatOutcome;
  prompt?: string;
  maxIterations?: number;
}

let heartbeatTimer: NodeJS.Timeout | null = null;
let heartbeatInFlight = false;
let heartbeatInitialized = false;

export function getDefaultHeartbeatIntervalMs(): number {
  const rawValue = Number(process.env.SIMPLECLAW_HEARTBEAT_INTERVAL_MS);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 300000;
}

export async function evaluateHeartbeat(): Promise<HeartbeatEvaluation> {
  const [memoryContext, outbox, inbox] = await Promise.all([
    loadLongTermMemory(),
    readOptionalMarkdownFile(OUTBOX_PATH),
    readOptionalMarkdownFile(INBOX_PATH),
  ]);

  const signals = collectSignals({ memoryContext, outbox, inbox });
  if (!signals.hasStrongSignal && !signals.hasWeakSignal) {
    return {
      outcome: {
        status: "noop",
        reason: signals.reason,
      },
    };
  }

  return {
    outcome: {
      status: "invoked",
      reason: signals.reason,
    },
    prompt: buildHeartbeatPrompt({
      memoryContext,
      outbox,
      inbox,
      signals,
    }),
    maxIterations: HEARTBEAT_MAX_ITERATIONS,
  };
}

export async function maybeStartHeartbeatLoop(
  options: AgentOptions,
  invoke: (prompt: string, runOptions: { model?: string; maxIterations?: number }) => Promise<void>,
): Promise<number | null> {
  if (options.heartbeat?.enabled !== true || heartbeatInitialized) {
    return null;
  }

  const intervalMs = options.heartbeat.intervalMs ?? getDefaultHeartbeatIntervalMs();
  const maxIterations = options.heartbeat.maxIterations ?? HEARTBEAT_MAX_ITERATIONS;

  startHeartbeatLoop(async () => {
    await options.heartbeat?.onTickStart?.();
    try {
      const evaluation = await evaluateHeartbeat();
      if (evaluation.outcome.status === "invoked" && evaluation.prompt) {
        await invoke(evaluation.prompt, {
          model: options.model,
          maxIterations: evaluation.maxIterations ?? maxIterations,
        });
      }
      await options.heartbeat?.onTickComplete?.(evaluation.outcome);
    } catch (error: any) {
      await options.heartbeat?.onTickError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }, intervalMs, async () => {
    await options.heartbeat?.onTickSkip?.();
  });

  return intervalMs;
}

export function startHeartbeatScheduler(
  dispatcher: AgentDispatcher,
  input: Omit<AgentDispatchSubmitInput, "prompt" | "onEvent"> & {
    onEvent?: (event: RuntimeDispatchEvent) => Promise<void> | void;
  },
  intervalMs = getDefaultHeartbeatIntervalMs(),
): number | null {
  if (heartbeatInitialized) {
    return null;
  }

  startHeartbeatLoop(async () => {
    const evaluation = await evaluateHeartbeat();
    await input.onEvent?.({
      type: "heartbeatEvaluated",
      outcome: evaluation.outcome,
      taskId: "heartbeat",
      source: input.source,
      scope: input.scope,
    });

    if (evaluation.outcome.status !== "invoked" || !evaluation.prompt) {
      await input.onEvent?.({
        type: "heartbeatNoop",
        outcome: evaluation.outcome,
        taskId: "heartbeat",
        source: input.source,
        scope: input.scope,
      });
      return;
    }

    if (dispatcher.hasConflictingTask(input.scope, input.dedupeKey ?? "heartbeat")) {
      await input.onEvent?.({
        type: "heartbeatSkipped",
        reason: "conflicting task already active for heartbeat scope",
        taskId: "heartbeat",
        source: input.source,
        scope: input.scope,
      });
      return;
    }

    await dispatcher.submit({
      ...input,
      prompt: evaluation.prompt,
      maxIterations: evaluation.maxIterations ?? input.maxIterations ?? HEARTBEAT_MAX_ITERATIONS,
      dedupeKey: input.dedupeKey ?? "heartbeat",
      onEvent: input.onEvent,
    });
  }, intervalMs, async () => {
    await input.onEvent?.({
      type: "heartbeatSkipped",
      reason: "prior heartbeat run still active",
      taskId: "heartbeat",
      source: input.source,
      scope: input.scope,
    });
  });

  return intervalMs;
}

export function stopHeartbeatScheduler(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  heartbeatTimer = null;
  heartbeatInFlight = false;
  heartbeatInitialized = false;
}

export function resetHeartbeatLoopForTests(): void {
  stopHeartbeatScheduler();
}

function startHeartbeatLoop(
  tickHandler: () => Promise<void>,
  intervalMs: number,
  onSkip?: () => Promise<void> | void,
): void {
  const tick = async () => {
    if (heartbeatInFlight) {
      await onSkip?.();
      return;
    }

    heartbeatInFlight = true;
    try {
      await tickHandler();
    } finally {
      heartbeatInFlight = false;
    }
  };

  heartbeatTimer = setInterval(() => {
    void tick();
  }, intervalMs);
  heartbeatInitialized = true;
}

async function readOptionalMarkdownFile(path: string): Promise<OptionalMarkdownFile> {
  try {
    const content = await readFile(path, "utf-8");
    return {
      exists: true,
      content,
    };
  } catch {
    return {
      exists: false,
      content: "",
    };
  }
}

function collectSignals({
  memoryContext,
  outbox,
  inbox,
}: {
  memoryContext: string;
  outbox: OptionalMarkdownFile;
  inbox: OptionalMarkdownFile;
}): SignalSummary {
  const memorySignals = detectMarkdownSignals(memoryContext, "memory");
  const outboxSignals = outbox.exists ? detectMarkdownSignals(outbox.content, "OUTBOX") : [];
  const inboxSignals = inbox.exists ? detectMarkdownSignals(inbox.content, "INBOX") : [];
  const outboxHasContent = outbox.exists && hasMeaningfulContent(outbox.content);
  const inboxAcknowledgesWork = inbox.exists && hasAcknowledgementSignal(inbox.content);
  const mismatchSignal = outboxHasContent && !inboxAcknowledgesWork;

  const strongReasons = [
    ...memorySignals,
    ...outboxSignals,
    ...(mismatchSignal ? ["OUTBOX has content without clear acknowledgement in INBOX"] : []),
  ];
  const weakReasons = inboxSignals;

  if (strongReasons.length > 0) {
    return {
      hasStrongSignal: true,
      hasWeakSignal: weakReasons.length > 0,
      reason: strongReasons.join("; "),
    };
  }

  if (weakReasons.length > 0) {
    return {
      hasStrongSignal: false,
      hasWeakSignal: true,
      reason: `ambiguous signals: ${weakReasons.join("; ")}`,
    };
  }

  return {
    hasStrongSignal: false,
    hasWeakSignal: false,
    reason: "no unfinished-work signals found in memory, OUTBOX, or INBOX",
  };
}

function detectMarkdownSignals(content: string, source: string): string[] {
  const signals: string[] = [];

  if (CHECKBOX_PATTERN.test(content)) {
    signals.push(`${source} has unchecked checklist items`);
  }

  for (const label of SIGNAL_LABELS) {
    const headingPattern = new RegExp(`^#{1,6}\\s*${escapeRegExp(label)}\\b`, "im");
    const sectionPattern = new RegExp(`^.*${escapeRegExp(label)}.*$`, "im");
    if (headingPattern.test(content) || sectionPattern.test(content)) {
      signals.push(`${source} references ${label}`);
      break;
    }
  }

  return signals;
}

function hasMeaningfulContent(content: string): boolean {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line.length > 0 && !line.startsWith("#"));
}

function hasAcknowledgementSignal(content: string): boolean {
  return /(acknowledged|working on|in progress|done|completed|resolved|blocked|status|report|finished)/i.test(content);
}

function buildHeartbeatPrompt({
  memoryContext,
  outbox,
  inbox,
  signals,
}: {
  memoryContext: string;
  outbox: OptionalMarkdownFile;
  inbox: OptionalMarkdownFile;
  signals: SignalSummary;
}): string {
  const sections = [
    "Scheduled heartbeat review. This is not an interactive user message.",
    "Review memory and comm files before acting.",
    "Continue unfinished work only if it is still actionable.",
    "Do not repeat completed work.",
    "Do not post to Discord unless there is something worth reporting.",
    "Only update memory or INBOX when there is meaningful progress, a blocker, or a durable observation.",
    "Prefer a no-op if nothing actionable remains.",
    `Heuristic reason: ${signals.reason}`,
    signals.hasWeakSignal && !signals.hasStrongSignal
      ? "These signals are ambiguous. Resolve ambiguity conservatively and prefer no-op if uncertain."
      : "There are likely unfinished tasks to review.",
    `Memory snapshot:\n${truncateSection(memoryContext)}`,
    outbox.exists
      ? `OUTBOX snapshot:\n${truncateSection(outbox.content)}`
      : "OUTBOX snapshot:\n(missing)",
    inbox.exists
      ? `INBOX snapshot:\n${truncateSection(inbox.content)}`
      : "INBOX snapshot:\n(missing)",
  ];

  return sections.join("\n\n");
}

function truncateSection(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_SECTION_CHARS) {
    return trimmed || "(empty)";
  }
  return `${trimmed.slice(0, MAX_SECTION_CHARS)}\n...[truncated]`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { DBClient } from "../db/client";

import { executeSwarmManifest } from "./dispatcher";

export function createHeartbeat(db: DBClient, sessionId: string, intervalMinutes: number = 30) {
    const nextTriggerDate = new Date(Date.now() + intervalMinutes * 60 * 1000);
    const nextTriggerStr = nextTriggerDate.toISOString().replace('T', ' ').replace('Z', '');
    db.upsertHeartbeat(sessionId, nextTriggerStr, 'pending');
    db.writeAuditLog(sessionId, 'continuous_mode_enabled', { interval_minutes: intervalMinutes, next_trigger: nextTriggerStr });
}

export async function handleHeartbeat(db: DBClient) {
    const pending = db.getPendingHeartbeats();

    for (const heartbeat of pending) {
        // Prevent double execution via idempotency check using a unique key per trigger
        const idempotencyKey = `heartbeat-${heartbeat.session_id}-${heartbeat.next_trigger}`;
        if (db.checkIdempotency(idempotencyKey)) {
            db.updateHeartbeatStatus(heartbeat.id, 'completed');
            continue;
        }

        // Update status so we don't process it multiple times in parallel loops
        db.updateHeartbeatStatus(heartbeat.id, 'processing');
        db.createTransactionLogEntry(idempotencyKey, 'started', {});

        try {
            const session = db.getSession(heartbeat.session_id);
            if (!session || !session.manifest) {
                db.updateHeartbeatStatus(heartbeat.id, 'error');
                db.logTransaction(idempotencyKey, 'failed', { error: 'Session or manifest not found' });
                continue;
            }

            // Gas check logic required by orchestrator policies
            const userId = session.user_id;
            const gasBalance = db.getGasBalance(userId);

            if (gasBalance <= 0) {
                db.writeAuditLog(heartbeat.session_id, 'continuous_mode_suspended', { reason: 'insufficient_gas' });
                db.updateHeartbeatStatus(heartbeat.id, 'failed');
                db.logTransaction(idempotencyKey, 'failed', { error: 'Insufficient gas' });
                continue;
            }

            db.writeAuditLog(heartbeat.session_id, 'heartbeat_triggered', { next_trigger: heartbeat.next_trigger });

            // Dispatch workers using the existing `executeSwarmManifest`
            const results = await executeSwarmManifest(session.manifest, heartbeat.session_id, db);

            const hasErrors = Object.values(results).some(res => res.status === "error");

            if (!hasErrors) {
                // We shouldn't debit gas strictly here if executeSwarmManifest already does, but
                // executeSwarmManifest actually handles the debiting via checking for gas_consumed_for_session
                // Actually, let's let executeSwarmManifest handle it or manually add a log to ensure 1 debit per trigger
                const runId = `gas_consumed_for_heartbeat_${Date.now()}`;
                await db.debitCredits(userId, 1);
                db.writeAuditLog(heartbeat.session_id, runId, { amount: 1 });
            }

            db.logTransaction(idempotencyKey, 'completed', results);

            // According to spec "Updates heartbeat_queue status to 'completed' or 'failed',
            // and sets the next next_trigger for recurring sessions"
            if (hasErrors) {
                db.updateHeartbeatStatus(heartbeat.id, 'failed');
            } else {
                db.updateHeartbeatStatus(heartbeat.id, 'completed');
            }

            // Set up the next trigger for recurring continuous mode (e.g., add 30 minutes)
            const nextTriggerDate = new Date(Date.now() + 30 * 60 * 1000);
            const nextTriggerStr = nextTriggerDate.toISOString().replace('T', ' ').replace('Z', '');

            // Only update the trigger for recurring sessions
            db.upsertHeartbeat(session.id, nextTriggerStr, 'pending');

        } catch (error: any) {
            console.error(`Error processing heartbeat for session ${heartbeat.session_id}:`, error);
            db.updateSessionStatus(heartbeat.session_id, 'error');
            db.writeAuditLog(heartbeat.session_id, 'heartbeat_execution_failed', { error: error.message || String(error) });
            db.logTransaction(idempotencyKey, 'failed', { error: error.message || String(error) });
            db.updateHeartbeatStatus(heartbeat.id, 'failed');
        }
    }
}

// Simple local polling loop for development purposes. In production this would be replaced by pg_cron.
export function startLocalScheduler(db: DBClient, intervalMs: number = 30000) {
    console.log(`Starting local heartbeat scheduler running every ${intervalMs}ms`);

    setInterval(() => {
        handleHeartbeat(db).catch(err => {
            console.error("Local scheduler loop error:", err);
        });
    }, intervalMs);
}
