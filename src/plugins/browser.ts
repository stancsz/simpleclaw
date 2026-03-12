import { execSync } from "node:child_process";
import type { Extension } from "../core/extensions.ts";

export const plugin: Extension = {
  name: "browser",
  type: "skill",
  execute: async (args: { action: string; url?: string; selector?: string; text?: string }) => {
    const { action, url, selector, text } = args;
    
    // Simplistic mapping to agent-browser CLI
    // In a real scenario, we might want to use the agent-browser library more robustly
    try {
      const bunPath = process.platform === "win32" ? "bun" : `${process.env.HOME || "/home/stanc"}/.bun/bin/bun`;
      const localBin = process.platform === "win32" 
        ? ".\\node_modules\\.bin\\agent-browser.cmd" 
        : "./node_modules/.bin/agent-browser";

      let command: string;
      
      // Multi-stage execution strategy
      if (process.platform === "win32") {
        command = `bunx agent-browser `;
      } else {
        // On Linux/GCP, we try to run it via bun directly to avoid shebang 'node' issues
        // We assume the real entry point is in node_modules/agent-browser/bin/agent-browser.js
        command = `${bunPath} run ./node_modules/agent-browser/bin/agent-browser.js `;
      }

      switch (action) {
        case "navigate":
          command += `navigate "${url}"`;
          break;
        case "click":
          command += `click "${selector}"`;
          break;
        case "type":
          command += `type "${selector}" "${text}"`;
          break;
        case "snapshot":
          command += `snapshot`;
          break;
        case "screenshot":
          command += `screenshot`;
          break;
        case "wait":
          command += `snapshot`; 
          break;
        default:
          return `Unknown browser action: ${action}`;
      }

      console.log(`🌐 Browser Skill: Executing "${command}"`);
      
      const env = { 
        ...process.env,
        PATH: `${process.env.HOME || "/home/stanc"}/.bun/bin:${process.env.PATH}`
      };

      try {
        const output = execSync(command, { env, timeout: 60000 }).toString();
        return output;
      } catch (innerError: any) {
        // Fallback to simple bunx if the direct path failed
        console.warn(`⚠️ First browser attempt failed, trying fallback...`);
        const fallbackCommand = `bunx agent-browser ${command.split('agent-browser.js ')[1]}`;
        const output = execSync(fallbackCommand, { env, timeout: 60000 }).toString();
        return output;
      }
    } catch (error: any) {
      console.error(`❌ Browser Error:`, error.message);
      return `TOOL_ERROR: Browser failed. Error: ${error.message}. TIP: If this was a search, try searching wttr.in or using a different URL.`;
    }
  },
};
