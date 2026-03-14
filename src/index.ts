import "dotenv/config";
import { extensionRegistry } from "./core/extensions.ts";
import { runAgentLoop } from "./core/agent.ts";
import { enforceSecurityLocks } from "./security/triple_lock.ts";
import { getDefaultHeartbeatIntervalMs } from "./core/heartbeat.ts";
import { loadPlugins } from "./core/loader.ts";
import { createServer } from "node:http";

const port = 3018;
let heartbeatTimer: NodeJS.Timeout | null = null;
let heartbeatInFlight = false;

function startHeartbeatScheduler() {
  if (heartbeatTimer) {
    return;
  }

  const intervalMs = getDefaultHeartbeatIntervalMs();
  heartbeatTimer = setInterval(async () => {
    if (heartbeatInFlight) {
      console.log("💓 Heartbeat skipped: prior run still active");
      return;
    }

    heartbeatInFlight = true;
    console.log("💓 Heartbeat started");

    try {
      await runAgentLoop("[heartbeat bootstrap]", {
        model: "gpt-5-nano",
        heartbeat: {
          enabled: true,
          intervalMs,
          maxIterations: 3,
          onTickSkip: async () => {
            console.log("💓 Heartbeat skipped: prior run still active");
          },
          onTickStart: async () => {
            console.log("💓 Heartbeat evaluating pending work");
          },
          onTickComplete: async (outcome) => {
            if (outcome.status === "invoked") {
              console.log(`💓 Heartbeat invoked agent loop: ${outcome.reason}`);
            } else {
              console.log(`💓 Heartbeat no-op: ${outcome.reason}`);
            }
            console.log("💓 Heartbeat completed");
          },
          onTickError: async (error) => {
            console.error("💓 Heartbeat failed:", error.message);
          },
        },
      });
    } catch (error: any) {
      console.error("💓 Heartbeat failed:", error.message);
    } finally {
      heartbeatInFlight = false;
    }
  }, intervalMs);

  console.log(`💓 Heartbeat scheduler started (intervalMs=${intervalMs})`);
}

function stopHeartbeatScheduler() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

process.once("exit", stopHeartbeatScheduler);
process.once("SIGINT", stopHeartbeatScheduler);
process.once("SIGTERM", stopHeartbeatScheduler);

export async function startClaw(config: any = {}) {
  startHeartbeatScheduler();
  await loadPlugins();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    // Construct a partial Request object for the extensions
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    // Simple Request mock for plugins
    const requestObject = {
      url: url.toString(),
      method: req.method,
      headers: headers,
      json: async () => {
        return new Promise((resolve) => {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve({});
            }
          });
        });
      },
    } as Request;

    const securityError = enforceSecurityLocks(requestObject);
    if (securityError) {
      res.writeHead(securityError.status, { "Content-Type": "application/json" });
      res.end(await securityError.text());
      return;
    }

    const extension = extensionRegistry.findWebhook(url.pathname);
    if (extension) {
      const response = await extension.execute(requestObject);
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(await response.text());
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found", path: url.pathname }));
    }
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${port} is already in use. Exiting to prevent ghost processes.`);
      process.exit(1);
    } else {
      console.error("❌ Server error:", err);
    }
  });

  server.listen(port, async () => {
    console.log(`🚀 SimpleClaw Server listening on http://localhost:${port}`);
    
    // Start active plugins only AFTER server is up
    const activePlugins = extensionRegistry.getAll();
    for (const plugin of activePlugins) {
      if (plugin.start) {
        console.log(`🔌 Starting plugin: ${plugin.name}...`);
        await plugin.start();
      }
    }
  });

  return server;
}

// Start standalone if executed directly
if (import.meta.main || process.argv[1]?.endsWith("index.ts")) {
  await startClaw();
}
