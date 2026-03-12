import OpenAI from "openai";
import { loadSkillsContext } from "./skills.ts";
import { executeNativeTool } from "./executor.ts";
import "dotenv/config";
import { loadLongTermMemory, updateMemory } from "./memory.ts";

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

export async function runAgentLoop(userMessage: string, options: AgentOptions = {}) {
  const model = options.model || process.env.AGENT_MODEL || "gpt-5-nano";
  const maxIterations = options.maxIterations || 15;
  
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
    // ... rest of tools
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

  const messages: any[] = [
    { 
      role: "system", 
      content: `You are SimpleClaw, an advanced autonomous research and execution agent. 
      
      **Core Philosophy:**
      1. **Autonomous Problem Solving**: You do not offer "options" or ask for "preference" unless you have exhausted all tool-based solutions. If a tool fails, analyze the error and try a different approach (e.g., a different URL or a different tool).
      2. **Professional & Non-Sloppy**: Your responses must be high-density, accurate, and perfectly formatted. No placeholders.
      3. **Thinking & Reasoning**: Always state your plan and reasoning clearly before calling tools.
      
      **Operating Instructions:**
      1. **Memory Usage**: You have a long-term memory. Use it! If you learn a user preference (like YYC for Calgary), remember it.
      2. **Browser Skills**: Navigate -> Snapshot -> Interact. If a page fails to load, try a Google Search instead of giving up.
      3. **Tool Failures**: If a command is "not found" or fails, do not just report it to the user. Try to rephrase or use a different tool if possible.
      
      ${memoryContext}
      ${skillsContext}` 
    },
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
      console.log(`🛠️ [CORE AGENT] Iteration ${iterations}: Executing ${aiMessage.tool_calls.length} tools...`);
      
      for (const toolCall of aiMessage.tool_calls as any[]) {
        const { name, arguments: argsString } = toolCall.function;
        const args = JSON.parse(argsString);
        
        if (options.onIteration) {
          await options.onIteration(`🛠️ Executing ${name}...`);
        }

        let result;
        if (name === "remember") {
          result = await updateMemory(args.info);
        } else {
          result = await executeNativeTool(name, args);
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
    completed: iterations < maxIterations
  };
}
