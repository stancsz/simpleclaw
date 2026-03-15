/**
 * agent.ts
 * 
 * SimpleClaw Meta-Orchestrator Core.
 * This file implements the main reasoning loop for the orchestrator.
 * It is responsible for parsing intent, coordinating visibility of sub-agents, 
 * and delegating tasks to workers (muscle) rather than performing heavy lifting themselves.
 */
import { loadSkillsContext } from "./skills.ts";
import { loadLongTermMemory } from "./memory.ts";
import {
  buildSystemPrompt,
  resolveAgentTaskKind,
  shouldEnableBootstrapProtocol,
  shouldPreferDirectResponse,
} from "./policy.ts";
import type { CapabilityExecutionOutcome } from "./executor.ts";
import type {
  CapabilityCatalog,
  CapabilityExecutionContext,
  CapabilityToolDefinition,
  RuntimeCapabilityContext,
} from "./capabilities.ts";

export interface HeartbeatAgentOutcome {
  status: "noop" | "invoked";
  reason: string;
}

export type AgentEvent =
  | { type: "taskStarted"; prompt: string; historyLength: number; model: string; maxIterations: number }
  | { type: "iterationStarted"; iteration: number }
  | { type: "iterationProgress"; iteration: number; message: string }
  | { type: "toolStarted"; iteration: number; toolName: string; args: Record<string, unknown> }
  | { type: "toolCompleted"; iteration: number; toolName: string; result: string }
  | { type: "toolFailed"; iteration: number; toolName: string; error: string }
  | { type: "finalResponse"; iteration: number; content: string }
  | { type: "maxIterationsReached"; iterations: number }
  | { type: "heartbeatEvaluated"; outcome: HeartbeatAgentOutcome }
  | { type: "heartbeatNoop"; outcome: HeartbeatAgentOutcome }
  | { type: "heartbeatSkipped"; reason: string }
  | { type: "autonomousTaskCompleted"; content: string }
  | { type: "capabilityUnknown"; iteration: number; capabilityName: string; reason: string }
  | { type: "capabilityDisabled"; iteration: number; capabilityName: string; reason: string }
  | { type: "capabilityDenied"; iteration: number; capabilityName: string; reason: string }
  | { type: "workerDelegationStarted"; worker: string; objective: string; attempt: number }
  | { type: "workerDelegationCompleted"; worker: string; status: string; summary: string; attempt: number };

export interface AgentLoopResult {
  content: string;
  iterations: number;
  messages: any[];
  completed: boolean;
}

export interface AgentOptions {
  model?: string;
  maxIterations?: number;
  source?: string;
  onIteration?: (message: string) => Promise<void> | void;
  emitEvent?: (event: AgentEvent) => Promise<void> | void;
  runtimeContext?: RuntimeCapabilityContext;
  capabilityCatalog?: CapabilityCatalog;
  capabilityExecutor?: (
    capabilityName: string,
    args: Record<string, unknown>,
    context: CapabilityExecutionContext,
  ) => Promise<CapabilityExecutionOutcome>;
  toolDefinitions?: CapabilityToolDefinition[];
  heartbeat?: {
    enabled: boolean;
    intervalMs?: number;
    maxIterations?: number;
    onTickStart?: () => Promise<void> | void;
    onTickSkip?: () => Promise<void> | void;
    onTickComplete?: (outcome: { status: "noop" | "invoked"; reason: string }) => Promise<void> | void;
    onTickError?: (error: Error) => Promise<void> | void;
  };
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

type OpenAIClient = {
  chat: {
    completions: {
      create: (input: {
        model: string;
        messages: any[];
        tools: any;
      }) => Promise<{
        choices: Array<{
          message?: {
            content?: string | null;
            tool_calls?: any[];
          };
        }>;
      }>;
    };
  };
};

let openaiClientPromise: Promise<OpenAIClient> | undefined;
let dotenvConfigPromise: Promise<unknown> | undefined;

export async function getOpenAIClient(): Promise<OpenAIClient> {
  if (!openaiClientPromise) {
    openaiClientPromise = import("openai").then(({ default: OpenAI }) => {
      return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      }) as OpenAIClient;
    });
  }

  return await openaiClientPromise;
}

async function ensureDotenvLoaded(): Promise<void> {
  if (!dotenvConfigPromise) {
    dotenvConfigPromise = import("dotenv").then((dotenv) => {
      dotenv.config({ override: true });
    }).catch(() => undefined);
  }

  await dotenvConfigPromise;
}

function stringifyToolResult(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result);
}

function sanitizeToolArgs(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
}

async function emitAgentEvent(options: AgentOptions, event: AgentEvent): Promise<void> {
  await options.emitEvent?.(event);
}

function getOutcomeToolMessage(outcome: CapabilityExecutionOutcome): string {
  switch (outcome.kind) {
    case "unknown":
      return `CAPABILITY_UNKNOWN: ${outcome.output}`;
    case "disabled":
      return `CAPABILITY_DISABLED: ${outcome.output}`;
    case "denied":
      return `CAPABILITY_DENIED: ${outcome.output}`;
    case "runtime_failure":
      return outcome.output.startsWith("TOOL_ERROR:") ? outcome.output : `TOOL_ERROR: ${outcome.output}`;
    case "success":
      return outcome.output;
  }
}

async function emitCapabilityOutcomeEvent(
  options: AgentOptions,
  iteration: number,
  capabilityName: string,
  outcome: CapabilityExecutionOutcome,
): Promise<void> {
  const reason = outcome.message ?? outcome.output;
  switch (outcome.kind) {
    case "unknown":
      await emitAgentEvent(options, {
        type: "capabilityUnknown",
        iteration,
        capabilityName,
        reason,
      });
      break;
    case "disabled":
      await emitAgentEvent(options, {
        type: "capabilityDisabled",
        iteration,
        capabilityName,
        reason,
      });
      break;
    case "denied":
      await emitAgentEvent(options, {
        type: "capabilityDenied",
        iteration,
        capabilityName,
        reason,
      });
      break;
    case "runtime_failure":
      await emitAgentEvent(options, {
        type: "toolFailed",
        iteration,
        toolName: capabilityName,
        error: reason,
      });
      break;
    case "success":
      break;
  }
}

async function resolveRuntimeContext(userMessage: string, options: AgentOptions): Promise<RuntimeCapabilityContext> {
  if (options.runtimeContext) {
    return options.runtimeContext;
  }

  const skillsContext = await loadSkillsContext();
  const memoryContext = await loadLongTermMemory();
  return {
    mode: "cli",
    taskKind: resolveAgentTaskKind({ source: options.source, prompt: userMessage }),
    source: options.source,
    prompt: userMessage,
    memoryContext,
    skillsContext,
    platform: process.platform,
    dispatcher: {
      submit: async () => ({ content: "", iterations: 0, messages: [], completed: false }),
      getInFlightTasks: () => [],
      getTaskSnapshots: () => [],
      cancelTask: () => false,
      hasConflictingTask: () => false,
    },
  };
}

export async function runAgentLoop(
  userMessage: string,
  options: AgentOptions = {},
  history: ConversationMessage[] = [],
): Promise<AgentLoopResult> {
  await ensureDotenvLoaded();

  const runtimeContext = await resolveRuntimeContext(userMessage, options);
  const model = options.model || process.env.AGENT_MODEL || "gpt-5-nano";
  const maxIterations = options.maxIterations || 10;
  const taskKind = resolveAgentTaskKind({ source: options.source, prompt: userMessage });
  const preferDirectResponse = shouldPreferDirectResponse({ source: options.source, prompt: userMessage });
  const visibleCapabilityNames = (options.toolDefinitions ?? []).map((tool) => tool.function.name);
  const systemPrompt = buildSystemPrompt({
    kind: taskKind,
    platform: runtimeContext.platform,
    memoryContext: runtimeContext.memoryContext,
    skillsContext: runtimeContext.skillsContext,
    visibleCapabilityNames,
    model,
  });

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...(preferDirectResponse
      ? [{ role: "system", content: "This is a simple interactive prompt. Answer directly unless tool use is clearly necessary." }]
      : []),
    ...(shouldEnableBootstrapProtocol(taskKind)
      ? [{ role: "system", content: "Bootstrap and `.agents/comm` coordination are enabled for this task when relevant." }]
      : []),
    ...history,
    { role: "user", content: userMessage },
  ];

  let iterations = 0;
  let finalContent = "";

  await emitAgentEvent(options, {
    type: "taskStarted",
    prompt: userMessage,
    historyLength: history.length,
    model,
    maxIterations,
  });

  const openai = await getOpenAIClient();

  while (iterations < maxIterations) {
    iterations++;
    await emitAgentEvent(options, {
      type: "iterationStarted",
      iteration: iterations,
    });

    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: (options.toolDefinitions ?? []) as any,
    });

    const aiMessage = response.choices[0]?.message;
    if (!aiMessage) {
      break;
    }

    messages.push(aiMessage);

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      await emitAgentEvent(options, {
        type: "iterationProgress",
        iteration: iterations,
        message: `Executing ${aiMessage.tool_calls.length} tool(s)`,
      });

      for (const toolCall of aiMessage.tool_calls as any[]) {
        const { name, arguments: argsString } = toolCall.function;
        const args = JSON.parse(argsString);

        if (options.onIteration) {
          await options.onIteration(`Using ${name}...`);
        }

        await emitAgentEvent(options, {
          type: "toolStarted",
          iteration: iterations,
          toolName: name,
          args: sanitizeToolArgs(args),
        });

        let result = "";
        try {
          if (!options.capabilityExecutor) {
            throw new Error("capability executor not configured");
          }

          const outcome = await options.capabilityExecutor(name, args, { runtime: runtimeContext });
          result = getOutcomeToolMessage(outcome);

          if (!outcome.ok) {
            await emitCapabilityOutcomeEvent(options, iterations, name, outcome);
          } else {
            await emitAgentEvent(options, {
              type: "toolCompleted",
              iteration: iterations,
              toolName: name,
              result,
            });
          }
        } catch (error: any) {
          const message = error instanceof Error ? error.message : String(error);
          result = `TOOL_ERROR: ${message}`;
          await emitAgentEvent(options, {
            type: "toolFailed",
            iteration: iterations,
            toolName: name,
            error: message,
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: stringifyToolResult(result),
        });
      }
      continue;
    }

    finalContent = aiMessage.content || "";
    await emitAgentEvent(options, {
      type: "finalResponse",
      iteration: iterations,
      content: finalContent,
    });
    break;
  }

  if (!finalContent && iterations >= maxIterations) {
    await emitAgentEvent(options, {
      type: "maxIterationsReached",
      iterations,
    });
  }

  return {
    content: finalContent,
    iterations,
    messages,
    completed: iterations < maxIterations || finalContent !== "",
  };
}
