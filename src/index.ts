import { handleWhatsAppWebhook } from "./webhooks/whatsapp.ts";
import { handleMessengerWebhook } from "./webhooks/messenger.ts";
import { handleDiscordWebhook } from "./webhooks/discord.ts";
import { enforceSecurityLocks } from "./security/triple_lock.ts";
import { config as agentBrainConfig } from "./config/agent_brain.ts";

console.log("Starting SimpleClaw Agent Server...");
console.log("Agent Brain Configuration:", JSON.stringify(agentBrainConfig));

const server = Bun.serve({
  port: 3000,
  async fetch(req: Request) {
    // 1. Triple-Lock Security Verification
    const securityRejection = enforceSecurityLocks(req);
    if (securityRejection) {
      return securityRejection;
    }

    // 2. Routing logic
    const url = new URL(req.url);

    if (url.pathname === "/whatsapp") {
      return handleWhatsAppWebhook(req);
    }

    if (url.pathname === "/messenger") {
      return handleMessengerWebhook(req);
    }

    if (url.pathname === "/discord") {
      return handleDiscordWebhook(req);
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  },
});

console.log(`Listening on http://localhost:${server.port}`);
