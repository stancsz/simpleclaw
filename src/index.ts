import { extensionRegistry } from "./core/extensions.ts";
import { loadPlugins } from "./core/loader.ts";
import { enforceSecurityLocks } from "./security/triple_lock.ts";
import { config as agentBrainConfig } from "./config/agent_brain.ts";

export async function startClaw(configOverride: any = {}) {
  console.log("Starting SimpleClaw Agent Server...");

  // Override the default config object natively, so plugins/extensions using it
  // read the updated remote values.
  Object.assign(agentBrainConfig, configOverride);

  console.log("Agent Brain Configuration:", JSON.stringify(agentBrainConfig));

  // Load all external plugins/extensions
  await loadPlugins();

  const server = Bun.serve({
    port: 3000,
    async fetch(req) {
      const url = new URL(req.url);
      return (
        enforceSecurityLocks(req) ||
        (await extensionRegistry.findWebhook(url.pathname)?.execute(req)) ||
        new Response(JSON.stringify({ error: "Not Found", path: url.pathname }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      );
    },
  });

  console.log(`Listening on http://localhost:${server.port}`);
  return server;
}

// Start standalone if executed directly
if (import.meta.main) {
  await startClaw();
}
