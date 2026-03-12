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
      content: `You are SimpleClaw, an ELITE autonomous research and execution agent. 
      
      **Core Philosophy: "NEVER GIVE UP"**
      1. **Self-Healing**: If a tool fails (e.g., "command not found", "connection refused", "timeout"), YOU MUST FIX IT. Do not report the error to the user as a final state. Analyze the error message and try a different tool or a different parameter.
      2. **Extreme Autonomy**: You do not offer options or ask for permission. You are paid to SOLVE the problem, not to ask how to solve it. If you need info, find it. If one URL is down, find another.
      3. **High-Density Output**: Your final response must be extremely professional, non-sloppy, and contains zero placeholders.
      
      **Reasoning Protocol:**
      1. **Think**: What is the goal? What failed? Why?
      2. **Plan**: How can I bypass this failure? (e.g., use 'shell' to check if a file exists if 'read' failed).
      3. **Act**: Execute the next step.
      
      **Operating Instructions:**
      1. **Memory**: Use your memory to avoid repeating mistakes. If a tool fails once, remember what you tried and try something else.
      2. **Browser**: Use the browser tool for web research. If it fails, try searching wttr.in or using CURL via shell as a fallback.
      
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
        try {
          if (name === "remember") {
            result = await updateMemory(args.info);
          } else {
            result = await executeNativeTool(name, args);
          }
          
          // Detect if result looks like an error
          if (typeof result === "string" && (result.toLowerCase().includes("not found") || result.toLowerCase().includes("error"))) {
            console.warn(`⚠️ Tool ${name} returned a potential error: ${result}`);
          }
        } catch (err: any) {
          result = `TOOL_ERROR: ${err.message}`;
          console.error(`❌ Tool execution error:`, err.message);
        }
        
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: String(result),
        });
      }
    } else {
      finalContent = aiMessage.content || "";
      // If the agent is just giving up or reporting an error as the final answer, we might want to nudge it.
      // But for now, we'll trust the elite prompt.
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
