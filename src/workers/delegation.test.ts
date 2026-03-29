import { describe, it, expect, beforeEach, mock } from "bun:test";
import { EngineRegistry } from "../core/delegation";
import { OpenCodeExecutionEngine } from "../engines/opencode";
import type { Task, ExecutionContext, TaskResult } from "../core/types";

describe("Delegation Engine Registry", () => {
  let registry: EngineRegistry;

  beforeEach(() => {
    registry = new EngineRegistry();
  });

  it("should register and retrieve an engine", () => {
    const mockEngine = new OpenCodeExecutionEngine();
    registry.register("test-engine", mockEngine);

    const retrieved = registry.get("test-engine");
    expect(retrieved).toBe(mockEngine);
  });

  it("should throw an error when retrieving an unregistered engine", () => {
    expect(() => registry.get("unknown-engine")).toThrow("Execution engine 'unknown-engine' is not registered.");
  });
});

describe("OpenCodeExecutionEngine Adapter", () => {
  let engine: OpenCodeExecutionEngine;

  beforeEach(() => {
    engine = new OpenCodeExecutionEngine();
  });

  it("should format task results correctly", async () => {
    const task: Task = {
      id: "task-1",
      description: "Test task",
      worker: "worker-1",
      skills: ["skill-1"],
      credentials: ["cred-1"],
      depends_on: [],
      action_type: "READ"
    };

    const context: ExecutionContext = {
      credentials: { "cred-1": "secret-value" },
      skillContent: "Mock skill content",
      sessionId: "session-1",
      userId: "user-1"
    };

    const result = await engine.execute(task, context);

    expect(result.status).toBe("completed");
    expect(result.delegated_to).toBe("opencode-mock");
    expect(result.skills_used).toEqual(["skill-1"]);
    expect(result.message).toContain("task-1");
  });

  it("should propagate errors from execution failures", async () => {
    const task: Task = {
      id: "error-task", // triggers simulated error
      description: "Error task",
      worker: "worker-1",
      skills: [],
      credentials: [],
      depends_on: [],
      action_type: "READ"
    };

    const context: ExecutionContext = {
      credentials: {},
      skillContent: "Mock skill content",
      sessionId: "session-1"
    };

    expect(engine.execute(task, context)).rejects.toThrow("Simulated opencode execution failure");
  });
});
