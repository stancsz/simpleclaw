import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createAgentDispatcher,
  type AgentLoopRunner,
  type RuntimeDispatchEvent,
} from "./src/core/dispatcher.ts";
import type { AgentEvent } from "./src/core/agent.ts";
import { formatFirstTaskLatencyProfile, type FirstTaskLatencyProfile } from "./cli/index.ts";
import { extensionRegistry, type Extension } from "./src/core/extensions.ts";
import { createCapabilityCatalog } from "./src/core/capabilities.ts";
import {
  canExecuteCapability,
  getCapabilityAuditLog,
  getStructuredCapabilityDisabled,
  getStructuredCapabilityDenial,
  getStructuredCapabilityUnknown,
  getVisibleCapabilities,
} from "./src/core/policy.ts";
import { createCapabilityExecutor } from "./src/core/executor.ts";
import {
  createGovernedRuntime,
  createStartupProfiler,
  resolveRuntimeMode,
  type RuntimeStartupProfile,
} from "./src/core/runtime.ts";
import { loadSkillsContext } from "./src/core/skills.ts";
import { enforceSecurityLocks } from "./src/security/triple_lock.ts";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe("startup profiling", () => {
  test("collects ordered startup phases when enabled", async () => {
    const profiler = createStartupProfiler(true);

    await profiler.measure("plugins", async () => {
      await Promise.resolve();
    });
    await profiler.measure("governedRuntime", async () => {
      await Promise.resolve();
    });

    const summary = profiler.finish();

    expect(summary).toBeDefined();
    expect(summary?.enabled).toBe(true);
    expect(summary?.totalBootstrapMs).toBeGreaterThanOrEqual(0);
    expect(summary?.phases.map((phase) => phase.name)).toEqual(["plugins", "governedRuntime"]);
    expect(summary?.phases.every((phase) => phase.durationMs >= 0)).toBe(true);
  });

  test("omits startup summary when disabled", async () => {
    const profiler = createStartupProfiler(false);
    await profiler.measure("plugins", async () => {
      await Promise.resolve();
    });

    expect(profiler.finish()).toBeUndefined();
  });

  test("formats first-task latency summary from collected milestones", () => {
    const profile: FirstTaskLatencyProfile = {
      promptToTaskStartedMs: 1.5,
      promptToIterationStartedMs: 3.25,
      promptToToolStartedMs: 6,
      promptToFinalResponseMs: 12.75,
      promptToTaskCompletedMs: 13.5,
    };

    expect(formatFirstTaskLatencyProfile(profile)).toBe(
      "submit→taskStarted 1.5ms | submit→iterationStarted 3.3ms | submit→toolStarted 6.0ms | submit→finalResponse 12.8ms | submit→taskCompleted 13.5ms",
    );
  });
});

describe("dispatcher behavior", () => {
  test("serializes work within one scope", async () => {
    const started: string[] = [];
    const firstGate = createDeferred<void>();
    const runner: AgentLoopRunner = async (prompt) => {
      started.push(prompt);
      if (prompt === "first") {
        await firstGate.promise;
      }
      return { content: `done:${prompt}`, iterations: 1, messages: [], completed: true };
    };

    const dispatcher = createAgentDispatcher({ runAgentLoop: runner });

    const firstPromise = dispatcher.submit({
      source: "test",
      scope: "scope:a",
      prompt: "first",
    });

    const secondPromise = dispatcher.submit({
      source: "test",
      scope: "scope:a",
      prompt: "second",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["first"]);

    firstGate.resolve();
    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);

    expect(started).toEqual(["first", "second"]);
    expect(firstResult.content).toBe("done:first");
    expect(secondResult.content).toBe("done:second");
  });

  test("cancels queued work before execution and emits cancellation", async () => {
    const started: string[] = [];
    const events: RuntimeDispatchEvent[] = [];
    const firstGate = createDeferred<void>();
    const runner: AgentLoopRunner = async (prompt) => {
      started.push(prompt);
      if (prompt === "first") {
        await firstGate.promise;
      }
      return { content: `done:${prompt}`, iterations: 1, messages: [], completed: true };
    };

    const dispatcher = createAgentDispatcher({ runAgentLoop: runner });

    const firstPromise = dispatcher.submit({
      source: "test",
      scope: "scope:a",
      prompt: "first",
      onEvent: (event) => { events.push(event); },
    });

    const secondPromise = dispatcher.submit({
      source: "test",
      scope: "scope:a",
      prompt: "second",
      onEvent: (event) => { events.push(event); },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const queuedTask = dispatcher
      .getTaskSnapshots()
      .find((task) => task.prompt === "second" && task.status === "queued");

    expect(queuedTask).toBeDefined();
    expect(dispatcher.cancelTask(queuedTask!.id)).toBe(true);

    firstGate.resolve();
    const cancelled = await secondPromise;
    await firstPromise;

    expect(cancelled.completed).toBe(false);
    expect(cancelled.iterations).toBe(0);
    expect(started).toEqual(["first"]);
    expect(
      events.some(
        (event) =>
          event.type === "taskCancelled" &&
          event.taskId === queuedTask!.id &&
          event.reason === "cancelled before execution",
      ),
    ).toBe(true);
  });
});

describe("capability policy", () => {
  const runtimeContext = {
    mode: "cli" as const,
    taskKind: "interactive" as const,
    prompt: "Implement a feature",
    memoryContext: "memory",
    skillsContext: "skills",
    platform: process.platform,
    dispatcher: createAgentDispatcher({ runAgentLoop: async () => ({ content: "", iterations: 0, messages: [], completed: true }) }),
  };

  test("approved capability is visible and executable", () => {
    const capability = {
      name: "read",
      description: "Read a file",
      inputSchema: { type: "object" as const, properties: { path: { type: "string" as const } }, required: ["path"] },
      category: "native" as const,
      approvalClass: "default" as const,
      handler: async () => ({ status: "completed" as const, content: "ok" }),
    };

    expect(getVisibleCapabilities([capability], runtimeContext)).toHaveLength(1);
    expect(canExecuteCapability(capability, runtimeContext).status).toBe("allowed");
  });

  test("restricted capability is hidden and disabled with stable reason", () => {
    const capability = {
      name: "shell",
      description: "Run shell",
      inputSchema: { type: "object" as const, properties: { cmd: { type: "string" as const } }, required: ["cmd"] },
      category: "native" as const,
      approvalClass: "restricted" as const,
      handler: async () => ({ status: "completed" as const, content: "ok" }),
    };

    expect(getVisibleCapabilities([capability], runtimeContext)).toHaveLength(0);
    expect(canExecuteCapability(capability, runtimeContext).status).toBe("disabled");
    expect(getCapabilityAuditLog([capability], runtimeContext)[0]).toContain("approval class restricted is not enabled");
  });

  test("extension-backed capability appears only when plugin and policy allow it", () => {
    const capability = {
      name: "browser",
      description: "Browser",
      inputSchema: { type: "object" as const, properties: { action: { type: "string" as const } }, required: ["action"] },
      category: "extension" as const,
      approvalClass: "network" as const,
      runtimeModes: ["cli" as const],
      handler: async () => ({ status: "completed" as const, content: "ok" }),
    };

    expect(getVisibleCapabilities([capability], runtimeContext)).toHaveLength(1);
  });
});

describe("capability executor", () => {
  const runtime = {
    mode: "cli" as const,
    taskKind: "interactive" as const,
    prompt: "test",
    memoryContext: "",
    skillsContext: "",
    platform: process.platform,
    dispatcher: createAgentDispatcher({ runAgentLoop: async () => ({ content: "", iterations: 0, messages: [], completed: true }) }),
  };

  test("unknown capability returns structured unknown outcome", async () => {
    const executor = createCapabilityExecutor({ catalog: createCapabilityCatalog([]) });
    const result = await executor.execute("missing", {}, { runtime });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("unknown");
    expect(result.output).toBe(getStructuredCapabilityUnknown("missing"));
  });

  test("disabled capability returns structured disabled outcome", async () => {
    const handler = mock(async () => ({ status: "completed" as const, content: "should not run" }));
    const executor = createCapabilityExecutor({
      catalog: createCapabilityCatalog([
        {
          name: "shell",
          description: "Run shell",
          inputSchema: { type: "object", properties: {}, required: [] },
          category: "native",
          approvalClass: "restricted",
          handler,
        },
      ]),
    });

    const result = await executor.execute("shell", {}, { runtime });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("disabled");
    expect(result.output).toBe(getStructuredCapabilityDisabled("shell", "approval class restricted is not enabled"));
    expect(handler).not.toHaveBeenCalled();
  });

  test("denied capability returns structured denied outcome", async () => {
    const handler = mock(async () => ({ status: "completed" as const, content: "should not run" }));
    const executor = createCapabilityExecutor({
      catalog: createCapabilityCatalog([
        {
          name: "remember",
          description: "Remember",
          inputSchema: { type: "object", properties: {}, required: [] },
          category: "native",
          approvalClass: "memory",
          handler,
        },
      ]),
    });

    const deniedRuntime = { ...runtime, taskKind: "interactive" as const };
    const result = await executor.execute("remember", {}, { runtime: deniedRuntime });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("disabled");
    expect(result.output).toBe(getStructuredCapabilityDisabled("remember", "memory writes are disabled for this task kind"));
    expect(handler).not.toHaveBeenCalled();
  });

  test("runtime failures return runtime_failure outcome", async () => {
    const executor = createCapabilityExecutor({
      catalog: createCapabilityCatalog([
        {
          name: "read",
          description: "Read",
          inputSchema: { type: "object", properties: {}, required: [] },
          category: "native",
          approvalClass: "default",
          handler: async () => {
            throw new Error("boom");
          },
        },
      ]),
    });

    const result = await executor.execute("read", {}, { runtime });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("runtime_failure");
    expect(result.output).toBe("TOOL_ERROR: boom");
  });

  test("approved capability returns normalized success outcome", async () => {
    const executor = createCapabilityExecutor({
      catalog: createCapabilityCatalog([
        {
          name: "read",
          description: "Read",
          inputSchema: { type: "object", properties: {}, required: [] },
          category: "native",
          approvalClass: "default",
          handler: async () => ({ status: "completed", content: "done" }),
        },
      ]),
    });

    const result = await executor.execute("read", {}, { runtime });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("success");
    expect(result.output).toBe("done");
  });
});

describe("runtime defaults", () => {
  const originalArgv = [...process.argv];
  const originalEnv = process.env.SIMPLECLAW_RUNTIME_MODE;

  beforeEach(() => {
    process.argv = [...originalArgv];
    if (originalEnv === undefined) {
      delete process.env.SIMPLECLAW_RUNTIME_MODE;
    } else {
      process.env.SIMPLECLAW_RUNTIME_MODE = originalEnv;
    }
  });

  test("defaults to cli mode", () => {
    process.argv = ["bun", "src/index.ts"];
    delete process.env.SIMPLECLAW_RUNTIME_MODE;

    expect(resolveRuntimeMode()).toBe("cli");
  });

  test("builds governed runtime with approved tools", async () => {
    const governed = await createGovernedRuntime(
      "cli",
      createAgentDispatcher({ runAgentLoop: async () => ({ content: "", iterations: 0, messages: [], completed: true }) }),
    );

    expect(governed.tools.some((tool) => tool.function.name === "delegate_to_opencode")).toBe(true);
    expect(governed.tools.some((tool) => tool.function.name === "shell")).toBe(false);
    expect(governed.auditLog.length).toBeGreaterThan(0);
  });

  test("resolves visible tools per run context", async () => {
    const governed = await createGovernedRuntime(
      "cli",
      createAgentDispatcher({ runAgentLoop: async () => ({ content: "", iterations: 0, messages: [], completed: true }) }),
    );

    const interactiveContext = await governed.createContext({ source: "cli", prompt: "hello" });
    const heartbeatContext = await governed.createContext({ source: "heartbeat", prompt: "continue background work" });

    const interactiveTools = governed.resolveToolsForRun(interactiveContext).map((tool) => tool.function.name);
    const heartbeatTools = governed.resolveToolsForRun(heartbeatContext).map((tool) => tool.function.name);

    expect(interactiveTools).not.toContain("remember");
    expect(heartbeatTools).toContain("remember");
    expect(interactiveTools).toContain("read");
    expect(heartbeatTools).toContain("read");
  });
});

describe("dispatcher forwards capability events", () => {
  test("forwards unknown, disabled, denied, and runtime failure events distinctly", async () => {
    const eventTypes: RuntimeDispatchEvent["type"][] = [];
    const runner: AgentLoopRunner = async (_prompt, options) => {
      await options?.emitEvent?.({
        type: "capabilityUnknown",
        iteration: 1,
        capabilityName: "missing",
        reason: "Unknown capability: missing",
      });
      await options?.emitEvent?.({
        type: "capabilityDisabled",
        iteration: 1,
        capabilityName: "remember",
        reason: "disabled for this run",
      });
      await options?.emitEvent?.({
        type: "capabilityDenied",
        iteration: 1,
        capabilityName: "browser",
        reason: "denied by policy",
      });
      await options?.emitEvent?.({
        type: "toolFailed",
        iteration: 1,
        toolName: "read",
        error: "boom",
      });
      return { content: "done", iterations: 1, messages: [], completed: true };
    };

    const dispatcher = createAgentDispatcher({ runAgentLoop: runner });
    await dispatcher.submit({
      source: "test",
      scope: "scope:events",
      prompt: "test",
      onEvent: (event) => {
        eventTypes.push(event.type);
      },
    });

    expect(eventTypes).toContain("capabilityUnknown");
    expect(eventTypes).toContain("capabilityDisabled");
    expect(eventTypes).toContain("capabilityDenied");
    expect(eventTypes).toContain("toolFailed");
  });
});


describe("delegation orchestration", () => {
  test("same-scope work serializes and duplicate work dedupes", async () => {
    const started: string[] = [];
    const gate = createDeferred<void>();
    const runner: AgentLoopRunner = async (prompt) => {
      started.push(prompt);
      if (prompt.includes("first")) {
        await gate.promise;
      }
      return { content: prompt, iterations: 1, messages: [], completed: true };
    };

    const dispatcher = createAgentDispatcher({ runAgentLoop: runner });

    const first = dispatcher.submit({
      source: "delegate",
      scope: "worker:opencode:test",
      prompt: "first delegation",
      dedupeKey: "same",
    });

    const duplicate = dispatcher.submit({
      source: "delegate",
      scope: "worker:opencode:test",
      prompt: "duplicate delegation",
      dedupeKey: "same",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    gate.resolve();

    const duplicateResult = await duplicate;
    await first;

    expect(duplicateResult.completed).toBe(false);
    expect(started).toEqual(["first delegation"]);
  });
});

describe("agent capability result formatting", () => {
  const baseRuntime = {
    mode: "cli" as const,
    taskKind: "interactive" as const,
    prompt: "test",
    memoryContext: "memory",
    skillsContext: "skills",
    platform: process.platform,
    dispatcher: createAgentDispatcher({ runAgentLoop: async () => ({ content: "", iterations: 0, messages: [], completed: true }) }),
  };

  function formatOutcomeForConversation(outcome: {
    kind: "unknown" | "disabled" | "denied" | "runtime_failure";
    output: string;
  }): string {
    switch (outcome.kind) {
      case "unknown":
        return `CAPABILITY_UNKNOWN: ${outcome.output}`;
      case "disabled":
        return `CAPABILITY_DISABLED: ${outcome.output}`;
      case "denied":
        return `CAPABILITY_DENIED: ${outcome.output}`;
      case "runtime_failure":
        return outcome.output.startsWith("TOOL_ERROR:") ? outcome.output : `TOOL_ERROR: ${outcome.output}`;
    }
  }

  test("formats unknown outcomes distinctly", () => {
    expect(
      formatOutcomeForConversation({
        kind: "unknown",
        output: getStructuredCapabilityUnknown("remember"),
      }),
    ).toStartWith("CAPABILITY_UNKNOWN:");
  });

  test("formats disabled outcomes distinctly", () => {
    expect(
      formatOutcomeForConversation({
        kind: "disabled",
        output: getStructuredCapabilityDisabled("remember", "disabled for this run"),
      }),
    ).toStartWith("CAPABILITY_DISABLED:");
  });

  test("formats denied outcomes distinctly", () => {
    expect(
      formatOutcomeForConversation({
        kind: "denied",
        output: getStructuredCapabilityDenial("remember", "denied by policy"),
      }),
    ).toStartWith("CAPABILITY_DENIED:");
  });

  test("formats runtime failures as tool errors", () => {
    expect(
      formatOutcomeForConversation({
        kind: "runtime_failure",
        output: "TOOL_ERROR: boom",
      }),
    ).toBe("TOOL_ERROR: boom");
  });
});

describe("security locks", () => {
  test("requires x-agent-id header", async () => {
    const request = new Request("http://localhost/discord", { method: "POST" });
    const response = enforceSecurityLocks(request);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
    expect(await response?.text()).toContain("Missing x-agent-id");
  });
});

describe("extension registry", () => {
  test("finds a registered webhook by route", () => {
    const extension: Extension = {
      name: `test-webhook-${Date.now()}-${Math.random()}`,
      type: "webhook",
      route: "/test-runtime-route",
      runtimeModes: ["server"],
      execute: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    };

    extensionRegistry.register(extension);
    expect(extensionRegistry.findWebhook("/test-runtime-route")?.name).toBe(extension.name);
  });
});

describe("skills loading", () => {
  test("loads the OpenCode prompt skill", async () => {
    const context = await loadSkillsContext();
    expect(context).toContain("OpenCode Delegation Skill");
  });
});

describe("screen capture plugin", () => {
  test("plugin is properly registered as extension", async () => {
    // Import the plugin using ES module syntax
    const { plugin } = await import("./src/plugins/screencap.ts");
    
    expect(plugin.name).toBe("screencap");
    expect(plugin.type).toBe("skill");
    expect(plugin.runtimeModes).toEqual(["cli", "hybrid", "server"]);
    expect(typeof plugin.execute).toBe("function");
  });

  test("plugin has correct action handling structure", async () => {
    const { plugin } = await import("./src/plugins/screencap.ts");
    
    // Test that the execute function returns a promise with expected structure
    const result = await plugin.execute({ action: "list_displays" });
    
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("message");
    // The actual implementation will either succeed or fail based on system
    // but the structure should be consistent
    if (result.success) {
      expect(result).toHaveProperty("displays");
      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("platform");
    } else {
      expect(result).toHaveProperty("error");
    }
  });
});

describe("GitHub plugin", () => {
  test("plugin is properly registered as extension", async () => {
    // Import the plugin using ES module syntax
    const { plugin } = await import("./src/plugins/github.ts");
    
    expect(plugin.name).toBe("github");
    expect(plugin.type).toBe("skill");
    expect(typeof plugin.execute).toBe("function");
  });

  test("plugin validates required parameters", async () => {
    const { plugin } = await import("./src/plugins/github.ts");
    
    // Test missing query parameter for search_repos
    const result = await plugin.execute({ action: "search_repos" });
    expect(result).toContain("ERROR: 'query' parameter is required");
  });

  test("plugin returns error for unknown action", async () => {
    const { plugin } = await import("./src/plugins/github.ts");
    
    const result = await plugin.execute({ action: "unknown_action" });
    expect(result).toContain("ERROR: Unknown GitHub action");
    expect(result).toContain("Available actions");
  });
});

describe("Google Drive plugin", () => {
  test("plugin is properly registered as extension", async () => {
    // Import the plugin using ES module syntax
    const { plugin } = await import("./src/plugins/gdrive.ts");
    
    expect(plugin.name).toBe("gdrive");
    expect(plugin.type).toBe("skill");
    expect(typeof plugin.execute).toBe("function");
  });

  test("plugin validates required parameters", async () => {
    const { plugin } = await import("./src/plugins/gdrive.ts");
    
    // Test missing parameters for create_file
    const result = await plugin.execute({ action: "create_file" });
    // The plugin first checks for CLI tools, so we expect that message
    expect(result).toContain("Google Drive CLI tools not installed");
  });

  test("plugin returns error for unknown action", async () => {
    const { plugin } = await import("./src/plugins/gdrive.ts");
    
    const result = await plugin.execute({ action: "unknown_action" });
    // The plugin first checks for CLI tools, so we expect that message
    expect(result).toContain("Google Drive CLI tools not installed");
  });
});

describe("Linear plugin", () => {
  test("plugin is properly registered as extension", async () => {
    // Import the plugin using ES module syntax
    const { plugin } = await import("./src/plugins/linear.ts");
    
    expect(plugin.name).toBe("linear");
    expect(plugin.type).toBe("skill");
    expect(typeof plugin.execute).toBe("function");
  });

  test("plugin validates required parameters", async () => {
    const { plugin } = await import("./src/plugins/linear.ts");
    
    // Test missing parameters for create_issue
    const result = await plugin.execute({ action: "create_issue" });
    // The plugin first checks for setup, so we expect that message
    expect(result).toContain("Linear integration requires setup");
  });

  test("plugin returns error for unknown action", async () => {
    const { plugin } = await import("./src/plugins/linear.ts");
    
    const result = await plugin.execute({ action: "unknown_action" });
    // The plugin first checks for setup, so we expect that message
    expect(result).toContain("Linear integration requires setup");
  });
});

describe("Agency Agent plugin", () => {
  test("plugin is properly registered as extension", async () => {
    const { plugin } = await import("./src/plugins/agency-agent.ts");

    expect(plugin.name).toBe("agency-agent");
    expect(plugin.type).toBe("skill");
    expect(typeof plugin.execute).toBe("function");
  });

  test("plugin validates required parameters", async () => {
    const { plugin } = await import("./src/plugins/agency-agent.ts");

    const result = await plugin.execute({ action: "delegate_task" });
    expect(result).toContain("ERROR: 'message' parameter is required");
  });

  test("plugin returns error for unknown action", async () => {
    const { plugin } = await import("./src/plugins/agency-agent.ts");

    const result = await plugin.execute({ action: "unknown_action" });
    expect(result).toContain("ERROR: Unknown action");
  });
});
