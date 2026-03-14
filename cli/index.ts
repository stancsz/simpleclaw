import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import type { AgentDispatcher, RuntimeDispatchEvent } from "../src/core/dispatcher.ts";
import type { ConversationMessage } from "../src/core/agent.ts";

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

export interface CliTransport {
  start(): void;
  close(): void;
}

export function createCliTransport(dispatcher: AgentDispatcher): CliTransport {
  const rl = readline.createInterface({ input, output });
  const history: ConversationMessage[] = [];
  const inFlightTasks = new Set<Promise<unknown>>();
  let spinnerTimer: NodeJS.Timeout | null = null;
  let spinnerFrame = 0;
  let statusMessage = "";
  let activePromptBuffer = "";
  let closing = false;
  let closePromise: Promise<void> | null = null;

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
      case "capabilityDenied":
        printDurable("Policy", `${event.capabilityName} denied: ${event.reason}`, colors.yellow);
        break;
      case "workerDelegationStarted":
        renderStatus(`Delegating to ${event.worker} (attempt ${event.attempt})`);
        break;
      case "workerDelegationCompleted":
        printDurable("Delegate", `${event.worker} ${event.status}: ${event.summary}`, event.status === "completed" ? colors.blue : colors.yellow);
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
    const result = await dispatcher.submit({
      source: "cli",
      prompt,
      scope: CLI_SCOPE,
      history: [...history],
      onEvent: renderEvent,
      dedupeKey: `prompt:${prompt}`,
    });

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
    start() {
      console.clear();
      console.log(`${colors.blue}${colors.bold}🦀 SimpleClaw CLI${colors.reset}`);
      console.log(`${colors.dim}Type /help for commands. Type /exit to quit.${colors.reset}\n`);
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
