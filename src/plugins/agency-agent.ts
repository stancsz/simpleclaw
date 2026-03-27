import type { Extension } from "../core/extensions";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export const plugin: Extension = {
  name: "agency-agent",
  type: "skill",
  execute: async (args: { action: string; message?: string }) => {
    const { action, message } = args;

    try {
      if (action === "delegate_task") {
        if (!message) return "ERROR: 'message' parameter is required for delegate_task";

        // Locate the python script representing the external agency-os agent
        const scriptPath = join(import.meta.dir, "agency-os", "agent.py");

        try {
           // Execute the python script and pass the message as an argument
           const { stdout, stderr } = await execFileAsync("python3", [scriptPath, "--message", message], { encoding: 'utf-8' });

           if (stderr) {
             console.warn("Agency agent produced stderr output:", stderr);
           }

           return stdout.trim();
        } catch (e: any) {
           // Self-healing / catch block
           console.error("Failed to call external agent natively:", e.message);
           return "ERROR: Agentic delegation failed. " + e.message;
        }

      } else {
        return `ERROR: Unknown action: ${action}. Available actions: delegate_task`;
      }
    } catch (error: any) {
      // Failure mode analysis & catch block
      console.error(`❌ Agency Agent Error:`, error.message);
      return `ERROR: [EXPERIMENTAL] Agency agent integration failed. Self-healing triggered. Error: ${error.message}`;
    }
  },
};
