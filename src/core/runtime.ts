import { createServer, type Server } from "node:http";
import os from "node:os";
import { extensionRegistry, type Extension, type RuntimeMode } from "./extensions.ts";
import { loadPlugins } from "./loader.ts";
import { enforceSecurityLocks } from "../security/triple_lock.ts";
import { createCliTransport, type CliTransport } from "../../cli/index.ts";
import {
  createAgentDispatcher,
  type AgentDispatcher,
  type AgentDispatchSubmitInput,
} from "./dispatcher.ts";
import { getDefaultHeartbeatIntervalMs, startHeartbeatScheduler, stopHeartbeatScheduler } from "./heartbeat.ts";
import {
  capabilityToToolDefinition,
  createCapabilityCatalog,
  type CapabilityCatalog,
  type CapabilityDefinition,
  type RuntimeCapabilityContext,
} from "./capabilities.ts";
import { createCapabilityExecutor } from "./executor.ts";
import { loadLongTermMemory, updateMemory } from "./memory.ts";
import { loadSkillsContext } from "./skills.ts";
import { getCapabilityAuditLog, getVisibleCapabilities, resolveAgentTaskKind } from "./policy.ts";
import { delegateToOpenCode } from "./opencode-worker.ts";
import { runAgentLoop, type AgentEvent, type AgentLoopResult, type AgentOptions, type ConversationMessage } from "./agent.ts";

const DEFAULT_PORT = 3018;
const DEFAULT_HEARTBEAT_SCOPE = "heartbeat:global";

export interface RuntimeStartOptions {
  mode?: RuntimeMode;
  port?: number;
  heartbeat?: {
    enabled?: boolean;
    intervalMs?: number;
  };
}

export interface GovernedAgentRuntime {
  catalog: CapabilityCatalog;
  tools: ReturnType<typeof capabilityToToolDefinition>[];
  createContext: (input: { source?: string; prompt: string }) => Promise<RuntimeCapabilityContext>;
  executeCapability: ReturnType<typeof createCapabilityExecutor>["execute"];
  auditLog: string[];
}

export interface RuntimeContext {
  mode: RuntimeMode;
  port: number;
  dispatcher: AgentDispatcher;
  cli?: CliTransport;
  server?: Server;
  governed: GovernedAgentRuntime;
  submitWork: (input: AgentDispatchSubmitInput) => Promise<void>;
  close: () => Promise<void>;
}

let pluginsLoaded = false;

export async function startRuntime(options: RuntimeStartOptions = {}): Promise<RuntimeContext> {
  const mode = resolveRuntimeMode(options.mode);
  const port = options.port ?? DEFAULT_PORT;

  if (!pluginsLoaded) {
    await loadPlugins();
    pluginsLoaded = true;
  }

  let governed!: GovernedAgentRuntime;
  const dispatcher = createAgentDispatcher({
    runAgentLoop: async (userMessage, agentOptions = {}, history = []) => {
      const runtimeContext = await governed.createContext({
        source: agentOptions.source,
        prompt: userMessage,
      });
      return await runAgentLoop(
        userMessage,
        {
          ...agentOptions,
          runtimeContext,
          capabilityCatalog: governed.catalog,
          capabilityExecutor: governed.executeCapability,
          toolDefinitions: governed.tools,
        },
        history,
      );
    },
  });
  const cleanupTasks: Array<() => Promise<void> | void> = [];

  governed = await createGovernedRuntime(mode, dispatcher);

  if (options.heartbeat?.enabled !== false) {
    const heartbeatIntervalMs = options.heartbeat?.intervalMs ?? getDefaultHeartbeatIntervalMs();
    startHeartbeatScheduler(
      dispatcher,
      {
        source: "heartbeat",
        scope: DEFAULT_HEARTBEAT_SCOPE,
        model: process.env.AGENT_MODEL || "gpt-5-nano",
        maxIterations: 3,
      },
      heartbeatIntervalMs,
    );
    cleanupTasks.push(() => stopHeartbeatScheduler());
  }

  let cli: CliTransport | undefined;
  if (mode === "cli" || mode === "hybrid") {
    cli = createCliTransport(dispatcher);
    cleanupTasks.push(() => cli?.close());
  }

  let server: Server | undefined;
  if (mode === "server" || mode === "hybrid") {
    server = await createWebhookServer(port, mode);
    cleanupTasks.push(
      () =>
        new Promise<void>((resolve, reject) => {
          server?.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        }),
    );
  }

  await startActiveExtensions(mode);

  return {
    mode,
    port,
    dispatcher,
    cli,
    server,
    governed,
    submitWork: async (input) => {
      await dispatcher.submit(input);
    },
    close: async () => {
      for (const cleanup of cleanupTasks.reverse()) {
        await cleanup();
      }
    },
  };
}

export async function createGovernedRuntime(
  mode: RuntimeMode,
  dispatcher: AgentDispatcher,
): Promise<GovernedAgentRuntime> {
  const catalog = createCapabilityCatalog(await buildCapabilityDefinitions(mode));
  const executor = createCapabilityExecutor({ catalog });
  const seedContext = await buildRuntimeCapabilityContext({ mode, dispatcher, prompt: "", source: "startup" });
  const visible = getVisibleCapabilities(catalog.getAll(), seedContext);
  const auditLog = getCapabilityAuditLog(catalog.getAll(), seedContext);

  for (const line of auditLog) {
    console.log(`[capability] ${line}`);
  }

  return {
    catalog,
    tools: visible.map(capabilityToToolDefinition),
    createContext: async ({ source, prompt }) => buildRuntimeCapabilityContext({ mode, dispatcher, source, prompt }),
    executeCapability: executor.execute,
    auditLog,
  };
}

async function buildRuntimeCapabilityContext({
  mode,
  dispatcher,
  source,
  prompt,
}: {
  mode: RuntimeMode;
  dispatcher: AgentDispatcher;
  source?: string;
  prompt: string;
}): Promise<RuntimeCapabilityContext> {
  const memoryContext = await loadLongTermMemory();
  const skillsContext = await loadSkillsContext();
  return {
    mode,
    taskKind: resolveAgentTaskKind({ source, prompt }),
    source,
    prompt,
    memoryContext,
    skillsContext,
    platform: os.platform(),
    dispatcher,
  };
}

async function buildCapabilityDefinitions(mode: RuntimeMode): Promise<CapabilityDefinition[]> {
  const nativeCapabilities: CapabilityDefinition[] = [
    {
      name: "read",
      description: "Read a file from disk",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      category: "native",
      runtimeModes: ["cli", "hybrid", "server"],
      approvalClass: "default",
      handler: async (args) => {
        const { executeNativeTool } = await import("./executor.ts");
        return { status: "completed", content: String(await executeNativeTool("read", args)) };
      },
    },
    {
      name: "remember",
      description: "Store durable information in long-term memory",
      inputSchema: {
        type: "object",
        properties: { info: { type: "string", description: "The information to remember" } },
        required: ["info"],
      },
      category: "native",
      runtimeModes: ["cli", "hybrid", "server"],
      approvalClass: "memory",
      handler: async (args) => ({
        status: "completed",
        content: await updateMemory(String(args.info ?? "")),
      }),
    },
    {
      name: "delegate_to_opencode",
      description: "Delegate bounded coding work to the approved OpenCode worker",
      inputSchema: {
        type: "object",
        properties: {
          objective: { type: "string", description: "Coding objective for the worker" },
          scope: { type: "array", items: { type: "string" }, description: "Relevant files or directories" },
          constraints: { type: "array", items: { type: "string" }, description: "Constraints the worker must respect" },
          acceptanceCriteria: {
            type: "array",
            items: { type: "string" },
            description: "Acceptance criteria for the delegated task",
          },
          retryBudget: { type: "number", description: "Maximum bounded follow-up attempts" },
        },
        required: ["objective"],
      },
      category: "meta",
      runtimeModes: ["cli", "hybrid", "server"],
      approvalClass: "delegate",
      handler: delegateToOpenCode,
    },
  ];

  const browserExtension = extensionRegistry.get("browser");
  const browserCapabilities: CapabilityDefinition[] = browserExtension
    ? [
        {
          name: "browser",
          description: "Interact with the browser extension when enabled",
          inputSchema: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["navigate", "click", "type", "snapshot", "screenshot", "wait"],
              },
              url: { type: "string" },
              selector: { type: "string" },
              text: { type: "string" },
            },
            required: ["action"],
          },
          category: "extension",
          runtimeModes: browserExtension.runtimeModes ?? [mode],
          approvalClass: "network",
          handler: async (args) => ({
            status: "completed",
            content: JSON.stringify(await browserExtension.execute(args)),
          }),
        },
      ]
    : [];

  return [...nativeCapabilities, ...browserCapabilities];
}

export function resolveRuntimeMode(mode?: RuntimeMode): RuntimeMode {
  if (mode) {
    return mode;
  }

  const flag = process.argv.find((arg) => arg.startsWith("--mode="));
  const flagValue = flag?.split("=")[1] as RuntimeMode | undefined;
  if (flagValue === "cli" || flagValue === "server" || flagValue === "hybrid") {
    return flagValue;
  }

  const envMode = process.env.SIMPLECLAW_RUNTIME_MODE as RuntimeMode | undefined;
  if (envMode === "cli" || envMode === "server" || envMode === "hybrid") {
    return envMode;
  }

  return "cli";
}

async function startActiveExtensions(mode: RuntimeMode): Promise<void> {
  const extensions = extensionRegistry.getAll();
  for (const extension of extensions) {
    if (!shouldStartExtension(extension, mode)) {
      continue;
    }

    console.log(`🔌 Starting plugin: ${extension.name}...`);
    await extension.start?.();
  }
}

function shouldStartExtension(extension: Extension, mode: RuntimeMode): boolean {
  if (!extension.start) {
    return false;
  }

  if (extension.activation && extension.activation !== "transport") {
    return false;
  }

  if (!extension.runtimeModes || extension.runtimeModes.length === 0) {
    return mode === "server" || mode === "hybrid";
  }

  return extension.runtimeModes.includes(mode);
}

function shouldExposeExtension(extension: Extension, mode: RuntimeMode): boolean {
  if (!extension.runtimeModes || extension.runtimeModes.length === 0) {
    return mode === "server" || mode === "hybrid";
  }

  return extension.runtimeModes.includes(mode);
}

async function createWebhookServer(port: number, mode: RuntimeMode): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    const requestObject = {
      url: url.toString(),
      method: req.method,
      headers,
      json: async () => {
        return new Promise((resolve) => {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve({});
            }
          });
        });
      },
    } as Request;

    const securityError = enforceSecurityLocks(requestObject);
    if (securityError) {
      res.writeHead(securityError.status, { "Content-Type": "application/json" });
      res.end(await securityError.text());
      return;
    }

    const extension = extensionRegistry.findWebhook(url.pathname);
    if (!extension || !shouldExposeExtension(extension, mode)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found", path: url.pathname }));
      return;
    }

    const response = await extension.execute(requestObject);
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(await response.text());
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use.`));
        return;
      }
      reject(err);
    });

    server.listen(port, () => {
      console.log(`🚀 SimpleClaw Server listening on http://localhost:${port}`);
      resolve();
    });
  });

  return server;
}
