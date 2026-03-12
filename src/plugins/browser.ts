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
      // Absolute path to bunx for robustness on GCP and local
      const bunxPath = process.platform === "win32" ? "bunx" : `${process.env.HOME || "/home/stanc"}/.bun/bin/bunx`;
      let command = `${bunxPath} agent-browser `;
      
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
          command += `snapshot`; // Fallback
          break;
        default:
          return `Unknown browser action: ${action}`;
      }

      console.log(`🌐 Browser Skill: Executing "${command}"`);
      
      // Merge PATH to ensure bun and bunx are found
      const env = { 
        ...process.env,
        PATH: `${process.env.HOME || "/home/stanc"}/.bun/bin:${process.env.PATH}`
      };

      const output = execSync(command, { env }).toString();
      return output;
    } catch (error: any) {
      console.error(`❌ Browser Error:`, error.message);
      return `Browser error: ${error.message}`;
    }
  },
};
