import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createAgentDispatcher,
  type AgentLoopRunner,
  type RuntimeDispatchEvent,
} from "./src/core/dispatcher.ts";
import { extensionRegistry, type Extension } from "./src/core/extensions.ts";
import { createCapabilityCatalog } from "./src/core/capabilities.ts";
import {
  canExecuteCapability,
  getCapabilityAuditLog,
  getStructuredCapabilityUnknown,
  getVisibleCapabilities,
} from "./src/core/policy.ts";
import { createCapabilityExecutor } from "./src/core/executor.ts";
import { createGovernedRuntime, resolveRuntimeMode } from "./src/core/runtime.ts";
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
      onEvent: (event) => events.push(event),
    });

    const secondPromise = dispatcher.submit({
      source: "test",
      scope: "scope:a",
      prompt: "second",
      onEvent: (event) => events.push(event),
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
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
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
      inputSchema: { type: "object", properties: { cmd: { type: "string" } }, required: ["cmd"] },
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
      inputSchema: { type: "object", properties: { action: { type: "string" } }, required: ["action"] },
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

  test("unknown capability returns structured error", async () => {
    const executor = createCapabilityExecutor({ catalog: createCapabilityCatalog([]) });
    const result = await executor.execute("missing", {}, { runtime });
    expect(result.ok).toBe(false);
    expect(result.output).toBe(getStructuredCapabilityUnknown("missing"));
  });

  test("denied capability never reaches handler", async () => {
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
    expect(handler).not.toHaveBeenCalled();
  });

  test("approved capability returns normalized output", async () => {
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
