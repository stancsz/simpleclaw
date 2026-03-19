import type { Task, ExecutionContext, TaskResult } from "./types";

export interface ExecutionEngine {
  execute(task: Task, context: ExecutionContext): Promise<TaskResult>;
}

export class OpenCodeExecutionEngine implements ExecutionEngine {
  async execute(task: Task, context: ExecutionContext): Promise<TaskResult> {
    const maskedCredentials = Object.keys(context.credentials).reduce((acc, key) => {
      acc[key] = "[masked]";
      return acc;
    }, {} as Record<string, string>);

    const primarySkill = task.skills && task.skills.length > 0 ? task.skills[0] : "none";

    console.log(`Delegating to execution engine with skill: ${primarySkill}, credentials: ${JSON.stringify(maskedCredentials)}`);

    // Mock execution output based on the task parameters
    // In a real implementation, this would call an external API (like `opencode`)
    // passing the context, credentials, and instructions.
    return {
      message: `Executed task ${task.id}: ${task.description}`,
      skills_used: task.skills || [],
      delegated_to: "opencode-mock",
      status: "completed"
    };
  }
}
