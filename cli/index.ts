import { performance } from "node:perf_hooks";
import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import type { AgentDispatcher, RuntimeDispatchEvent } from "../src/core/dispatcher.ts";
import type { ConversationMessage } from "../src/core/agent.ts";
import type { RuntimeStartupProfile } from "../src/core/runtime.ts";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const prefix = `${colors.cyan}${colors.bold}🦀 SimpleClaw >${colors.reset} `;
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CLI_SCOPE = "cli:session";

export interface FirstTaskLatencyProfile {
  promptToTaskStartedMs?: number;
  promptToIterationStartedMs?: number;
  promptToToolStartedMs?: number;
  promptToFinalResponseMs?: number;
  promptToTaskCompletedMs?: number;
}

export interface CliTransportOptions {
  startupProfile?: RuntimeStartupProfile;
}

export interface CliTransport {
  start(startupProfile?: RuntimeStartupProfile): void;
  close(): void;
}

export function formatFirstTaskLatencyProfile(profile: FirstTaskLatencyProfile): string {
  const parts = [
    profile.promptToTaskStartedMs !== undefined
      ? `submit→taskStarted ${profile.promptToTaskStartedMs.toFixed(1)}ms`
      : undefined,
    profile.promptToIterationStartedMs !== undefined
      ? `submit→iterationStarted ${profile.promptToIterationStartedMs.toFixed(1)}ms`
      : undefined,
    profile.promptToToolStartedMs !== undefined
      ? `submit→toolStarted ${profile.promptToToolStartedMs.toFixed(1)}ms`
      : undefined,
    profile.promptToFinalResponseMs !== undefined
      ? `submit→finalResponse ${profile.promptToFinalResponseMs.toFixed(1)}ms`
      : undefined,
    profile.promptToTaskCompletedMs !== undefined
      ? `submit→taskCompleted ${profile.promptToTaskCompletedMs.toFixed(1)}ms`
      : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" | ");
}

export function createCliTransport(dispatcher: AgentDispatcher, options: CliTransportOptions = {}): CliTransport {
  const rl = readline.createInterface({ input, output });
  const history: ConversationMessage[] = [];
  const inFlightTasks = new Set<Promise<unknown>>();
  let spinnerTimer: NodeJS.Timeout | null = null;
  let spinnerFrame = 0;
  let statusMessage = "";
  let activePromptBuffer = "";
  let closing = false;
  let closePromise: Promise<void> | null = null;
  let startupProfile = options.startupProfile;
  let firstTaskProfilePrinted = false;
  let firstTaskSubmittedAt: number | null = null;
  let firstTaskLatencyProfile: FirstTaskLatencyProfile | null = null;

  const maybeCaptureFirstTaskMetric = (
    key: keyof FirstTaskLatencyProfile,
    submittedAt: number | null,
    profile: FirstTaskLatencyProfile | null,
  ) => {
    if (submittedAt === null || !profile || profile[key] !== undefined) {
      return;
    }
    profile[key] = performance.now() - submittedAt;
  };

  const printFirstTaskProfileIfComplete = () => {
    if (firstTaskProfilePrinted || !firstTaskLatencyProfile) {
      return;
    }
    if (firstTaskLatencyProfile.promptToTaskCompletedMs === undefined) {
      return;
    }
    const summary = formatFirstTaskLatencyProfile(firstTaskLatencyProfile);
    if (summary) {
      printDurable("Profile", `First task ${summary}`, colors.dim);
      firstTaskProfilePrinted = true;
    }
  };

  const formatStartupProfile = (profile: RuntimeStartupProfile, promptReadyMs: number): string => {
    const slowestPhase = profile.phases.reduce<RuntimeStartupProfile["phases"][number] | undefined>((slowest, phase) => {
      if (!slowest || phase.durationMs > slowest.durationMs) {
        return phase;
      }
      return slowest;
    }, undefined);
    const slowestSummary = slowestPhase
      ? `${slowestPhase.name} ${slowestPhase.durationMs.toFixed(1)}ms`
      : "n/a";
    return `bootstrap ${profile.totalBootstrapMs.toFixed(1)}ms | prompt-ready ${promptReadyMs.toFixed(1)}ms | slowest ${slowestSummary}`;
  };

  const maybePrintStartupProfile = () => {
    if (!startupProfile?.enabled) {
      return;
    }
    const promptReadyMs = performance.now() - startupProfile.startedAt;
    printDurable("Profile", formatStartupProfile(startupProfile, promptReadyMs), colors.dim);
    startupProfile = undefined;
  };

  const beginFirstTaskProfile = () => {
    if (firstTaskSubmittedAt !== null) {
      return;
    }
    firstTaskSubmittedAt = performance.now();
    firstTaskLatencyProfile = {};
  };

  const resetFirstTaskProfileIfNeeded = () => {
    if (!firstTaskProfilePrinted) {
      firstTaskSubmittedAt = null;
      firstTaskLatencyProfile = null;
    }
  };

  const isFirstProfiledTaskEvent = (event: RuntimeDispatchEvent) =>
    event.source === "cli" && firstTaskSubmittedAt !== null;

  const captureFirstTaskEvent = (event: RuntimeDispatchEvent) => {
    if (!isFirstProfiledTaskEvent(event)) {
      return;
    }

    switch (event.type) {
      case "taskStarted":
        maybeCaptureFirstTaskMetric("promptToTaskStartedMs", firstTaskSubmittedAt, firstTaskLatencyProfile);
        break;
      case "iterationStarted":
        maybeCaptureFirstTaskMetric("promptToIterationStartedMs", firstTaskSubmittedAt, firstTaskLatencyProfile);
        break;
      case "toolStarted":
        maybeCaptureFirstTaskMetric("promptToToolStartedMs", firstTaskSubmittedAt, firstTaskLatencyProfile);
        break;
      case "finalResponse":
        maybeCaptureFirstTaskMetric("promptToFinalResponseMs", firstTaskSubmittedAt, firstTaskLatencyProfile);
        break;
      case "taskCompleted":
        maybeCaptureFirstTaskMetric("promptToTaskCompletedMs", firstTaskSubmittedAt, firstTaskLatencyProfile);
        printFirstTaskProfileIfComplete();
        break;
      default:
        break;
    }
  };

  const finalizeFirstTaskProfile = () => {
    printFirstTaskProfileIfComplete();
    if (firstTaskProfilePrinted) {
      firstTaskSubmittedAt = null;
      firstTaskLatencyProfile = null;
    }
  };

  const resetFirstTaskProfileOnError = () => {
    resetFirstTaskProfileIfNeeded();
  };

  const trackTask = <T>(promise: Promise<T>): Promise<T> => {
    inFlightTasks.add(promise);
    promise.finally(() => {
      inFlightTasks.delete(promise);
    });
    return promise;
  };

  const waitForInFlightTasks = async () => {
    while (inFlightTasks.size > 0) {
      await Promise.allSettled(Array.from(inFlightTasks));
    }
  };

  const requestClose = async () => {
    if (closePromise) {
      return closePromise;
    }

    closing = true;
    closePromise = (async () => {
      if (inFlightTasks.size > 0) {
        renderStatus("Waiting for active work to finish");
      }
      await waitForInFlightTasks();
      clearSpinner();
      process.stdout.write("\x1B[?25h");
      rl.close();
    })();

    return closePromise;
  };

  const maybeRenderPrompt = () => {
    if (!closing) {
      renderPrompt();
    }
  };

  const maybeRestoreInput = () => {
    if (!closing) {
      rl.write(activePromptBuffer);
    }
  };

  const printClosingNotice = () => {
    if (closing) {
      process.stdout.write("\x1B[?25h");
      console.log(`${colors.yellow}${colors.bold}Goodbye!${colors.reset}`);
    }
  };

  const renderPrompt = () => {
    process.stdout.write(prefix);
  };

  const clearSpinner = () => {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    process.stdout.write("\r\x1B[K");
  };

  const renderStatus = (message: string) => {
    statusMessage = message;
    if (!spinnerTimer) {
      process.stdout.write("\x1B[?25l");
      spinnerTimer = setInterval(() => {
        const frame = spinnerFrames[spinnerFrame];
        spinnerFrame = (spinnerFrame + 1) % spinnerFrames.length;
        process.stdout.write(`\r\x1B[K${colors.magenta}${frame} ${statusMessage}${colors.reset}`);
      }, 80);
    }
  };

  const printDurable = (label: string, message: string, color: string) => {
    clearSpinner();
    process.stdout.write("\x1B[?25h");
    console.log(`${color}${colors.bold}${label}:${colors.reset} ${message}`);
    maybeRenderPrompt();
    maybeRestoreInput();
  };

  const renderEvent = async (event: RuntimeDispatchEvent) => {
    captureFirstTaskEvent(event);

    switch (event.type) {
      case "taskQueued":
        renderStatus(`Queued ${event.source} task`);
        break;
      case "taskStarted":
        renderStatus(`Running ${event.source} task`);
        break;
      case "iterationStarted":
        renderStatus(`Iteration ${event.iteration}`);
        break;
      case "iterationProgress":
        renderStatus(event.message);
        break;
      case "toolStarted":
        renderStatus(`Using ${event.toolName}`);
        break;
      case "toolCompleted":
        renderStatus(`Finished ${event.toolName}`);
        break;
      case "toolFailed":
        printDurable("Status", `Tool ${event.toolName} failed: ${event.error}`, colors.yellow);
        break;
      case "capabilityUnknown":
        printDurable("Policy", `${event.capabilityName} unknown: ${event.reason}`, colors.yellow);
        break;
      case "capabilityDisabled":
        printDurable("Policy", `${event.capabilityName} disabled: ${event.reason}`, colors.yellow);
        break;
      case "capabilityDenied":
        printDurable("Policy", `${event.capabilityName} denied: ${event.reason}`, colors.yellow);
        break;
      case "workerDelegationStarted":
        renderStatus(`Delegating to ${event.worker} (attempt ${event.attempt})`);
        break;
      case "workerDelegationCompleted":
        printDurable(
          "Delegate",
          `${event.worker} ${event.status}: ${event.summary}`,
          event.status === "completed" ? colors.blue : colors.yellow,
        );
        break;
      case "heartbeatEvaluated":
        renderStatus(`Heartbeat: ${event.outcome.reason}`);
        break;
      case "heartbeatNoop":
        printDurable("Heartbeat", event.outcome.reason, colors.dim);
        break;
      case "heartbeatSkipped":
        printDurable("Heartbeat", event.reason, colors.dim);
        break;
      case "finalResponse":
        if (event.source === "heartbeat") {
          printDurable("Background update", event.content, colors.blue);
        }
        break;
      case "taskCompleted":
        clearSpinner();
        process.stdout.write("\x1B[?25h");
        break;
      case "taskFailed":
        printDurable("Error", event.error.message, colors.red);
        break;
      case "taskCancelled":
        printDurable("Status", event.reason, colors.dim);
        break;
      case "maxIterationsReached":
        printDurable("Status", "Reached maximum iterations.", colors.yellow);
        break;
      case "taskDeduped":
        printDurable("Heartbeat", `Skipped duplicate ${event.dedupeKey} task.`, colors.dim);
        break;
    }
  };

  const handleCommand = async (line: string) => {
    switch (line) {
      case "/help":
        printDurable("Help", "/help, /clear, /exit", colors.green);
        return true;
      case "/clear":
        clearSpinner();
        console.clear();
        return true;
      case "/exit":
        await requestClose();
        return true;
      default:
        return false;
    }
  };

  const submitUserPrompt = async (prompt: string) => {
    activePromptBuffer = "";
    beginFirstTaskProfile();
    const result = await dispatcher.submit({
      source: "cli",
      prompt,
      scope: CLI_SCOPE,
      history: [...history],
      onEvent: renderEvent,
      dedupeKey: `prompt:${prompt}`,
    });

    finalizeFirstTaskProfile();
    history.push({ role: "user", content: prompt });
    if (result.content) {
      history.push({ role: "assistant", content: result.content });
      printDurable("SimpleClaw", result.content, colors.green);
    }
  };

  const close = () => {
    void requestClose();
  };

  return {
    start(nextStartupProfile?: RuntimeStartupProfile) {
      if (nextStartupProfile) {
        startupProfile = nextStartupProfile;
      }
      console.clear();
      console.log(`${colors.blue}${colors.bold}🦀 SimpleClaw CLI${colors.reset}`);
      console.log(`${colors.dim}Type /help for commands. Type /exit to quit.${colors.reset}\n`);
      maybePrintStartupProfile();
      renderPrompt();

      rl.on("line", async (line) => {
        clearSpinner();
        const trimmed = line.trim();
        activePromptBuffer = "";

        if (!trimmed) {
          maybeRenderPrompt();
          return;
        }

        if (trimmed.startsWith("/") && (await handleCommand(trimmed))) {
          maybeRenderPrompt();
          return;
        }

        const task = trackTask(
          submitUserPrompt(trimmed).catch((error: any) => {
            resetFirstTaskProfileOnError();
            printDurable("Error", error instanceof Error ? error.message : String(error), colors.red);
          }),
        );

        if (!closing) {
          renderPrompt();
        }

        await task;
      });

      rl.on("SIGINT", async () => {
        await requestClose();
      });

      rl.on("pause", () => {
        clearSpinner();
      });

      rl.on("resume", () => {
        maybeRenderPrompt();
      });

      rl.input.on("data", () => {
        activePromptBuffer = rl.line;
      });

      rl.on("close", () => {
        clearSpinner();
        printClosingNotice();
        process.stdout.write("\x1B[?25h");
        process.exit(0);
      });

      process.on("SIGINT", () => {
        void requestClose();
      });

      process.on("SIGTERM", () => {
        void requestClose();
      });

      maybeRenderPrompt();
    },
    close,
  };
}
