import { execSync } from "node:child_process";
import type { Extension } from "../core/extensions";

export const plugin: Extension = {
  name: "opencli",
  type: "skill",
  execute: async (args: { action: string; command?: string }) => {
    const { action, command } = args;

    try {
      if (action !== "run") {
         return `ERROR: Unknown opencli action: ${action}. Available actions: run`;
      }

      if (!command) {
         return "ERROR: 'command' parameter is required for opencli run";
      }

      console.log(`🔌 OpenCLI Skill: Executing "npx @jackwener/opencli ${command}"`);

      try {
        const output = execSync(`./node_modules/.bin/opencli ${command}`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 60000,
        }).trim();

        if (!output) {
           return `OpenCLI ${command} completed successfully (no output).`;
        }
        return output;

      } catch (innerError: any) {
         const stderr = innerError.stderr?.toString() || "";
         const stdout = innerError.stdout?.toString() || "";
         console.error(`❌ OpenCLI command failed:`, innerError.message, stderr);
         return `ERROR: OpenCLI command failed.\nStdout: ${stdout}\nStderr: ${stderr}\nError: ${innerError.message}`;
      }
    } catch (error: any) {
       console.error(`❌ OpenCLI Error:`, error.message);
       return `ERROR: OpenCLI skill failed. Error: ${error.message}`;
    }
  },
};
