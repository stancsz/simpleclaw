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

/**
 * Heartbeat & Continuous Mode Operations (SWARM_SPEC.md §14)
 *
 * Local Simulation:
 * The orchestrator HTTP handler calls `processPendingHeartbeats` asynchronously to
 * simulate a cron job checking the heartbeat queue for any due executions.
 *
 * Production Transition (Supabase pg_cron):
 * In a true sovereign production setup, this logic shifts entirely off the platform.
 * The user's Supabase instance utilizes the `pg_cron` extension to run a scheduled
 * SQL job every 30 minutes. That job fires a webhook (POST /api/swarms/heartbeat)
 * which boots a new Orchestrator invocation specifically for that session.
 * Thus, the `next_trigger` loop is maintained persistently in the Sovereign Motherboard,
 * entirely decoupling execution scheduling from the platform's internal state.
 */

export async function scheduleHeartbeat(sessionId: string, db: any): Promise<void> {
  const nextTrigger = new Date(Date.now() + 30 * 60000).toISOString().replace('T', ' ').replace('Z', '');
  db.scheduleHeartbeat(sessionId, nextTrigger);
  db.writeAuditLog(sessionId, "continuous_mode_enabled", { next_trigger: nextTrigger });
}

export async function processPendingHeartbeats(db: any): Promise<void> {
  const pending = db.getPendingHeartbeats();
  for (const heartbeat of pending) {
    // Idempotency: Use transaction_log to ensure a specific heartbeat execution
    // isn't fired multiple times if concurrent orchestrator triggers fire.
    const idempotencyKey = `heartbeat_execution_${heartbeat.id}`;
    if (db.checkIdempotency(idempotencyKey)) {
        continue;
    }

    // Attempt to log the transaction first. If this was a real concurrent DB transaction,
    // this acts as a lock.
    db.createTransactionLogEntry(idempotencyKey, 'completed', { heartbeat_id: heartbeat.id });

    db.updateHeartbeatStatus(heartbeat.id, "processing");
    const session = db.getSession(heartbeat.session_id);
    if (!session || !session.manifest) {
      db.updateHeartbeatStatus(heartbeat.id, "error");
      continue;
    }

    try {
      // Import dynamically to avoid circular dependencies if any
      const { executeSwarmManifest } = await import("./dispatcher");
      await executeSwarmManifest(session.manifest, heartbeat.session_id, db);
      db.updateHeartbeatStatus(heartbeat.id, "completed");
      await rescheduleHeartbeat(heartbeat.session_id, db);
    } catch (err: any) {
      db.updateHeartbeatStatus(heartbeat.id, "error");
      db.writeAuditLog(heartbeat.session_id, "continuous_mode_error", { error: err.message || String(err) });
    }
  }
}

export async function rescheduleHeartbeat(sessionId: string, db: any): Promise<void> {
  const nextTrigger = new Date(Date.now() + 30 * 60000).toISOString().replace('T', ' ').replace('Z', '');
  db.scheduleHeartbeat(sessionId, nextTrigger);
  db.writeAuditLog(sessionId, "continuous_mode_rescheduled", { next_trigger: nextTrigger });
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
