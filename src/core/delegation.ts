import type { Task, ExecutionContext, TaskResult } from "./types";

export interface DelegationEngine {
  execute(task: Task, context: ExecutionContext): Promise<TaskResult>;
}

export class EngineRegistry {
  private engines = new Map<string, DelegationEngine>();

  register(name: string, engine: DelegationEngine) {
    this.engines.set(name, engine);
  }

  get(name: string): DelegationEngine {
    const engine = this.engines.get(name);
    if (!engine) {
      throw new Error(`Execution engine '${name}' is not registered.`);
    }
    return engine;
  }
}

export const registry = new EngineRegistry();

import { OpenCodeExecutionEngine } from "../engines/opencode";

// Register default engines
registry.register("opencode", new OpenCodeExecutionEngine());
// Example mock registrations for other engines can be added here
