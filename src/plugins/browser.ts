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
      let command: string;
      const binPath = "./node_modules/.bin/agent-browser";
      const winBinPath = ".\\node_modules\\.bin\\agent-browser.cmd";
      
      if (process.platform === "win32") {
        command = `${winBinPath} `;
      } else {
        command = `${binPath} `;
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

      const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      ];
      const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

      console.log(`🌐 Browser Skill: Executing "${command}"`);
      
      try {
        const output = execSync(command, { 
          cwd: process.cwd(),
          timeout: 60000,
          env: { 
            ...process.env, 
            USER_AGENT: randomUA,
            AGENT_BROWSER_HEADLESS: "true" 
          },
          stdio: ['ignore', 'pipe', 'pipe'] 
        }).toString().trim();
        
        if (!output) {
          return "Action completed successfully (no text output).";
        }
        return output;
      } catch (innerError: any) {
        const stderr = innerError.stderr?.toString() || "";
        const stdout = innerError.stdout?.toString() || "";
        console.error(`❌ Browser command failed:`, innerError.message, stderr);
        return `TOOL_ERROR: Browser execution failed. \nStdout: ${stdout}\nStderr: ${stderr}\nError: ${innerError.message}`;
      }
    } catch (error: any) {
      console.error(`❌ Browser Error:`, error.message);
      return `TOOL_ERROR: Browser failed. Error: ${error.message}`;
    }
  },
};
