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
      let command = "bunx agent-browser ";
      switch (action) {
        case "navigate":
          command += `navigate ${url}`;
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
        default:
          return `Unknown browser action: ${action}`;
      }

      console.log(`🌐 Browser Skill: Executing "${command}"`);
      const output = execSync(command).toString();
      return output;
    } catch (error: any) {
      return `Browser error: ${error.message}`;
    }
  },
};
