import OpenAI from "openai";
import { loadSkillsContext } from "./skills.ts";
import { executeNativeTool } from "./executor.ts";
import "dotenv/config";
import { maybeStartHeartbeatLoop } from "./heartbeat.ts";
import { loadLongTermMemory, updateMemory } from "./memory.ts";
import os from "node:os";

// Initialize OpenAI with configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

export interface AgentOptions {
  model?: string;
  maxIterations?: number;
  onIteration?: (message: string) => Promise<void> | void;
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

export async function runAgentLoop(userMessage: string, options: AgentOptions = {}, history: ConversationMessage[] = []) {
  const model = options.model || process.env.AGENT_MODEL || "gpt-5-nano";
  const maxIterations = options.maxIterations || 10; // Lower default for responsiveness

  await maybeStartHeartbeatLoop(options, async (prompt, runOptions) => {
    await runAgentLoop(prompt, {
      model: runOptions.model || model,
      maxIterations: runOptions.maxIterations,
    });
  });

  const tools = [
    {
      type: "function",
      function: {
        name: "remember",
        description: "Store a new piece of information in long-term memory. Use this only for important facts, preferences, or project updates.",
        parameters: {
          type: "object",
          properties: { info: { type: "string", description: "The information to remember" } },
          required: ["info"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "shell",
        description: "Execute a shell command",
        parameters: {
          type: "object",
          properties: { cmd: { type: "string" } },
          required: ["cmd"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read",
        description: "Read a file from disk",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write",
        description: "Write content to a file on disk",
        parameters: {
          type: "object",
          properties: { 
            path: { type: "string", description: "Path to the file" },
            content: { type: "string", description: "Content to write" }
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "browser",
        description: "Interact with the web browser",
        parameters: {
          type: "object",
          properties: {
            action: { 
              type: "string", 
              enum: ["navigate", "click", "type", "snapshot", "screenshot", "wait"],
              description: "The action to perform" 
            },
            url: { type: "string", description: "The URL for navigate action" },
            selector: { type: "string", description: "CSS selector for click/type action" },
            text: { type: "string", description: "Text for type action" },
          },
          required: ["action"],
        },
      },
    },
  ];

  const skillsContext = await loadSkillsContext();
  const memoryContext = await loadLongTermMemory();
  const platform = os.platform();

  const messages: any[] = [
    { 
      role: "system", 
      content: `You are SimpleClaw, an autonomous versatile agent.
      
      **Current Platform**: ${platform}
      
      **Operational Protocol**:
      1. **Self-Initialize**: If \`.agents/comm/OUTBOX.md\` or \`.agents/comm/INBOX.md\` do not exist, create them immediately to establish your operational channel.
      2. **Check Context**: Read \`.agents/comm/OUTBOX.md\` for pending instructions and \`.agents/comm/INBOX.md\` for recent status/learnings before acting.
      3. **Bias for Action**: If a task is assigned in OUTBOX, START. If no task is found, monitor for updates or check logs.
      4. **Report Back**: Document progress, results, or new patterns in \`.agents/comm/INBOX.md\`. 
      5. **Shared Knowledge**: If you implement a fix or hit a blocker, update \`🧠 System Learnings\` in \`.agents/comm/INBOX.md\`.
      5. **Assume & Execute**: Make reasonable assumptions for missing details.
      6. **Tool First for Data**: If a task involves real-world data, use the 'browser' tool immediately.
      7. **Extreme Autonomy**: You have 'read', 'write', and 'shell' tools. If built-in tools fail, write custom scripts to disk and execute them. Never say "I can't fix it".
      8. **Conciseness**: Keep conversational output minimal.
      
      ${memoryContext}
      ${skillsContext}` 
    },
    ...history,
    { role: "user", content: userMessage }
  ];

  let iterations = 0;
  let finalContent = "";

  while (iterations < maxIterations) {
    iterations++;
    
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages,
      tools: tools as any,
    });

    const aiMessage = response.choices[0]?.message;
    if (!aiMessage) break;

    messages.push(aiMessage);

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      console.log(`🛠️ Iteration ${iterations}: Executing ${aiMessage.tool_calls.length} tools...`);
      
      for (const toolCall of aiMessage.tool_calls as any[]) {
        const { name, arguments: argsString } = toolCall.function;
        const args = JSON.parse(argsString);
        
        if (options.onIteration) {
          await options.onIteration(`🛠️ Using ${name}...`);
        }

        let result;
        try {
          if (name === "remember") {
            result = await updateMemory(args.info);
          } else {
            result = await executeNativeTool(name, args);
          }
        } catch (err: any) {
          result = `TOOL_ERROR: ${err.message}`;
        }
        
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: String(result),
        });
      }
    } else {
      finalContent = aiMessage.content || "";
      break;
    }
  }

  return {
    content: finalContent,
    iterations: iterations,
    messages: messages,
    completed: iterations < maxIterations || finalContent !== ""
  };
}
