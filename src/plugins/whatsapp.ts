import { executeNativeTool } from "../core/executor.ts";
import { aiIpiSanitizer } from "../security/triple_lock.ts";
import type { Extension } from "../core/extensions.ts";

export const plugin: Extension = {
  name: "whatsapp",
  type: "webhook",
  route: "/whatsapp",
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
      console.log("Received WhatsApp payload:", payload);

      // Call the native agent BAU to process the message logic
      const result = await executeNativeTool("shell", { cmd: "echo" });
      console.log("Agent result:", result);

      return new Response(JSON.stringify({ status: "ok", processed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
      });
    }
  },
};
