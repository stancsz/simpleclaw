import { performance } from "node:perf_hooks";
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
  resolveToolsForRun: (context: RuntimeCapabilityContext) => ReturnType<typeof capabilityToToolDefinition>[];
  executeCapability: ReturnType<typeof createCapabilityExecutor>["execute"];
  auditLog: string[];
}

export interface RuntimeStartupPhaseTiming {
  name:
    | "plugins"
    | "governedRuntime"
    | "heartbeatRegistration"
    | "cliTransport"
    | "serverStartup"
    | "extensionStartup";
  durationMs: number;
}

export interface RuntimeStartupProfile {
  enabled: boolean;
  startedAt: number;
  totalBootstrapMs: number;
  phases: RuntimeStartupPhaseTiming[];
}

export interface RuntimeContext {
  mode: RuntimeMode;
  port: number;
  dispatcher: AgentDispatcher;
  cli?: CliTransport;
  server?: Server;
  governed: GovernedAgentRuntime;
  startupProfile?: RuntimeStartupProfile;
  submitWork: (input: AgentDispatchSubmitInput) => Promise<void>;
  close: () => Promise<void>;
}

let pluginsLoaded = false;

export function isStartupProfilingEnabled(): boolean {
  const value = process.env.SIMPLECLAW_PROFILE_STARTUP;
  return value === "1" || value === "true";
}

export function createStartupProfiler(enabled = isStartupProfilingEnabled()) {
  const startedAt = performance.now();
  const phases: RuntimeStartupPhaseTiming[] = [];

  return {
    enabled,
    startedAt,
    async measure<T>(name: RuntimeStartupPhaseTiming["name"], run: () => Promise<T>): Promise<T> {
      if (!enabled) {
        return await run();
      }
      const phaseStartedAt = performance.now();
      const result = await run();
      phases.push({
        name,
        durationMs: performance.now() - phaseStartedAt,
      });
      return result;
    },
    finish(): RuntimeStartupProfile | undefined {
      if (!enabled) {
        return undefined;
      }
      return {
        enabled: true,
        startedAt,
        totalBootstrapMs: performance.now() - startedAt,
        phases: [...phases],
      };
    },
  };
}

export async function startRuntime(options: RuntimeStartOptions = {}): Promise<RuntimeContext> {
  const mode = resolveRuntimeMode(options.mode);
  const port = options.port ?? DEFAULT_PORT;
  const startupProfiler = createStartupProfiler();

  if (!pluginsLoaded) {
    await startupProfiler.measure("plugins", async () => {
      await loadPlugins();
      pluginsLoaded = true;
    });
  }

  let governed!: GovernedAgentRuntime;
  const dispatcher = createAgentDispatcher({
    runAgentLoop: async (userMessage, agentOptions = {}, history = []) => {
      const runtimeContext = await governed.createContext({
        source: agentOptions.source,
        prompt: userMessage,
      });
      const toolDefinitions = governed.resolveToolsForRun(runtimeContext);
      return await runAgentLoop(
        userMessage,
        {
          ...agentOptions,
          runtimeContext,
          capabilityCatalog: governed.catalog,
          capabilityExecutor: governed.executeCapability,
          toolDefinitions,
        },
        history,
      );
    },
  });
  const cleanupTasks: Array<() => Promise<void> | void> = [];

  governed = await startupProfiler.measure("governedRuntime", async () => {
    return await createGovernedRuntime(mode, dispatcher);
  });

  if (options.heartbeat?.enabled !== false) {
    const heartbeatIntervalMs = options.heartbeat?.intervalMs ?? getDefaultHeartbeatIntervalMs();
    await startupProfiler.measure("heartbeatRegistration", async () => {
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
    });
    cleanupTasks.push(() => stopHeartbeatScheduler());
  }

  let cli: CliTransport | undefined;
  if (mode === "cli" || mode === "hybrid") {
    cli = await startupProfiler.measure("cliTransport", async () => {
      return createCliTransport(dispatcher);
    });
    cleanupTasks.push(() => cli?.close());
  }

  let server: Server | undefined;
  if (mode === "server" || mode === "hybrid") {
    server = await startupProfiler.measure("serverStartup", async () => {
      return await createWebhookServer(port, mode);
    });
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

  await startupProfiler.measure("extensionStartup", async () => {
    await startActiveExtensions(mode);
  });

  const startupProfile = startupProfiler.finish();

  return {
    mode,
    port,
    dispatcher,
    cli,
    server,
    governed,
    startupProfile,
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
  const auditLog = getCapabilityAuditLog(catalog.getAll(), seedContext);

  for (const line of auditLog) {
    console.log(`[capability] ${line}`);
  }

  return {
    catalog,
    tools: getVisibleCapabilities(catalog.getAll(), seedContext).map(capabilityToToolDefinition),
    createContext: async ({ source, prompt }) => buildRuntimeCapabilityContext({ mode, dispatcher, source, prompt }),
    resolveToolsForRun: (context) => getVisibleCapabilities(catalog.getAll(), context).map(capabilityToToolDefinition),
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
      name: "write",
      description: "Write content to a file",
      inputSchema: {
        type: "object",
        properties: { 
          path: { type: "string" },
          content: { type: "string" }
        },
        required: ["path", "content"],
      },
      category: "native",
      runtimeModes: ["cli", "hybrid", "server"],
      approvalClass: "default",
      handler: async (args) => {
        const { executeNativeTool } = await import("./executor.ts");
        return { status: "completed", content: String(await executeNativeTool("write", args)) };
      },
    },
    {
      name: "shell",
      description: "Execute a shell command",
      inputSchema: {
        type: "object",
        properties: { 
          cmd: { type: "string" }
        },
        required: ["cmd"],
      },
      category: "native",
      runtimeModes: ["cli", "hybrid", "server"],
      approvalClass: "default",
      handler: async (args) => {
        const { executeNativeTool } = await import("./executor.ts");
        return { status: "completed", content: String(await executeNativeTool("shell", args)) };
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

  // Get all registered extensions and convert them to capabilities
  const extensionCapabilities: CapabilityDefinition[] = [];
  const extensions = extensionRegistry.getAll();
  
  for (const extension of extensions) {
    // Skip extensions that aren't skills (like webhooks, knowledgebases)
    if (extension.type !== "skill") continue;
    
    // Create capability definition for each skill extension
    extensionCapabilities.push({
      name: extension.name,
      description: `Execute ${extension.name} skill`,
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string" },
            // Add other properties dynamically based on extension type
            ...(extension.name === "browser" ? {
              url: { type: "string" },
              selector: { type: "string" },
              text: { type: "string" },
            } : {}),
            ...(extension.name === "screencap" ? {
              format: { type: "string", enum: ["png", "jpeg", "jpg"] },
              filename: { type: "string" },
              display: { type: "number" },
              screen: { type: "number" },
            } : {}),
            ...(extension.name === "github" ? {
              owner: { type: "string" },
              repo: { type: "string" },
              path: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
              head: { type: "string" },
              base: { type: "string" },
              pull_number: { type: "string" },
              issue_number: { type: "string" },
              query: { type: "string" },
              content: { type: "string" },
              branch: { type: "string" },
              state: { type: "string" },
              labels: { type: "string" },
            } : {}),
            ...(extension.name === "gdrive" ? {
              query: { type: "string" },
              file_id: { type: "string" },
              folder_id: { type: "string" },
              name: { type: "string" },
              content: { type: "string" },
              mime_type: { type: "string" },
              parent_id: { type: "string" },
            } : {}),
            ...(extension.name === "linear" ? {
              query: { type: "string" },
              issue_id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              team_id: { type: "string" },
              state: { type: "string" },
              label: { type: "string" },
              assignee_id: { type: "string" },
              project_id: { type: "string" },
            } : {}),
          },
          required: ["action"],
        },
      category: "extension",
      runtimeModes: extension.runtimeModes ?? [mode],
      approvalClass: extension.name === "browser" ? "network" : 
                    extension.name === "github" ? "network" :
                    extension.name === "gdrive" ? "network" :
                    extension.name === "linear" ? "network" : "default",
      handler: async (args) => ({
        status: "completed",
        content: JSON.stringify(await extension.execute(args)),
      }),
    });
  }

  return [...nativeCapabilities, ...extensionCapabilities];
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
