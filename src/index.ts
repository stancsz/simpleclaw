import "dotenv/config";
import { extensionRegistry } from "./core/extensions.ts";
import { loadPlugins } from "./core/loader.ts";
import { enforceSecurityLocks } from "./security/triple_lock.ts";
import { config as agentBrainConfig } from "./config/agent_brain.ts";

console.log("Starting SimpleClaw Agent Server...");
console.log("Agent Brain Configuration:", JSON.stringify(agentBrainConfig));

// Load all external plugins/extensions
await loadPlugins();

import { createServer } from "node:http";

const port = 3015;
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
        req.on("end", () => resolve(JSON.parse(body)));
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
    console.error(`❌ Port ${port} is already in use. Exiting to prevent dangling processes.`);
    process.exit(1);
  } else {
    console.error("❌ Server error:", err);
  }
});

server.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
