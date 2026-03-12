import OpenAI from "openai";
import { loadSkillsContext } from "./skills.ts";
import { executeNativeTool } from "./executor.ts";
import "dotenv/config";
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
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function runAgentLoop(userMessage: string, options: AgentOptions = {}, history: ConversationMessage[] = []) {
  const model = options.model || process.env.AGENT_MODEL || "gpt-5-nano";
  const maxIterations = options.maxIterations || 10; // Lower default for responsiveness
  
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
      1. **Check History**: Always scan the provided conversation history for context, previous answers, or user preferences before taking any other action.
      2. **Bias for Action & Self-Healing**: Your goal is to EXECUTING. If a request is clear, START. If a tool fails, do not give up—find a workaround or write a script to fix it.
      3. **Assume & Execute**: Make reasonable assumptions for missing details. If you need more info later, you can mention it in your final report.
      4. **Tool First for Data**: If a task involves real-world data (flights, weather, search), use the 'browser' tool immediately.
      5. **Extreme Autonomy (Core Directive)**: You have 'read', 'write', and 'shell' tools. If our built-in tools (like 'browser') fail, you are expected to write your own custom scripts (JS/TS or Shell) to disk and execute them to get the required data. Never say "I can't fix it"—create a solution.
      6. **Conciseness**: Keep your conversational output minimal. Your primary value is the result of your tool use.
      
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
