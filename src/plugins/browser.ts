import { execSync } from "node:child_process";
import type { Extension } from "../core/extensions";

export const plugin: Extension = {
  name: "browser",
  type: "skill",
  execute: async (args: { action: string; url?: string; selector?: string; text?: string; path?: string }) => {
    const { action, url, selector, text, path } = args;
    
    // Validate required parameters before attempting execution
    switch (action) {
      case "navigate":
        if (!url) return "ERROR: 'url' parameter is required for navigate action";
        break;
      case "click":
        if (!selector) return "ERROR: 'selector' parameter is required for click action";
        break;
      case "type":
        if (!selector) return "ERROR: 'selector' parameter is required for type action";
        if (!text) return "ERROR: 'text' parameter is required for type action";
        break;
      case "screenshot":
        if (!path) return "ERROR: 'path' parameter is required for screenshot action";
        break;
      case "extract":
        if (!selector) return "ERROR: 'selector' parameter is required for extract action";
        break;
    }
    
    // Fallback simple fetch for basic navigation if browser is blocked
    const simpleFetch = async (targetUrl: string) => {
      console.log(`📡 Browser Fallback: Attempting simple fetch for ${targetUrl}`);
      try {
        const response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          }
        });
        
        if (!response.ok) {
          return `FETCH_ERROR: Received status ${response.status} from ${targetUrl}`;
        }
        
        const html = await response.text();
        // Return a stripped version of the HTML to avoid context flooding
        return `SUCCESS (via Fetch Fallback):\nStatus: ${response.status}\nContent Summary: ${html.substring(0, 500)}...\n[Note: This was a static fetch because the browser tool was bypassed or failed.]`;
      } catch (e: any) {
        return `FETCH_ERROR: ${e.message}`;
      }
    };

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
          command += `screenshot "${path}"`;
          break;
        case "wait":
          command += `snapshot`; 
          break;
        case "extract":
          command += `extract "${selector}"`;
          break;
        default:
          return `ERROR: Unknown browser action: ${action}\nAvailable actions: navigate, click, type, snapshot, screenshot, wait, extract`;
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
        
        // Check for common block patterns in output
        if (output.includes("Access Denied") || output.includes("Unusual traffic") || output.includes("403 Forbidden")) {
           if (action === "navigate" && url) {
             return await simpleFetch(url);
           }
        }

        if (!output) {
          return "Action completed successfully (no text output).";
        }
        return output;
      } catch (innerError: any) {
        const stderr = innerError.stderr?.toString() || "";
        const stdout = innerError.stdout?.toString() || "";
        console.error(`❌ Browser command failed:`, innerError.message, stderr);

        // Auto-fallback on total failure for navigation
        if (action === "navigate" && url) {
          return await simpleFetch(url);
        }

        return `TOOL_ERROR: Browser execution failed. \nStdout: ${stdout}\nStderr: ${stderr}\nError: ${innerError.message}`;
      }
    } catch (error: any) {
      console.error(`❌ Browser Error:`, error.message);
      if (action === "navigate" && url) {
        return await simpleFetch(url);
      }
      return `TOOL_ERROR: Browser failed. Error: ${error.message}`;
    }
  },
};
