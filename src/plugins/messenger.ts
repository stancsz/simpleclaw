import { executeNativeTool } from "../core/executor.ts";
import { runAgentLoop } from "../core/agent.ts";
import { aiIpiSanitizer } from "../security/triple_lock.ts";
import type { Extension } from "../core/extensions.ts";

export const plugin: Extension = {
  name: "messenger",
  type: "webhook",
  activation: "passive",
  runtimeModes: ["server", "hybrid"],
  route: "/messenger",
  execute: async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
      });
    }

    try {
      const rawPayload = await req.json();

      // Guardian Lock implementation
      const payload = aiIpiSanitizer(rawPayload);
      console.log("Received Messenger payload:", payload);

      // Call the core agent loop to process the message logic
      const result = await runAgentLoop(String(payload.message?.text || ""), {
        model: "gpt-5-nano"
      });
      console.log("Agent result:", result.content);

      return new Response(JSON.stringify({ status: "ok", processed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Messenger webhook error:", error);
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
      });
    }
  },
};
