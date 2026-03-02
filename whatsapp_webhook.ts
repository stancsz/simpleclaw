import { executeNativeTool } from "./claw_native_bau.ts";

export async function handleWhatsAppWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const rawPayload = await req.json();

    // Guardian Lock implementation
    const haikuIpiSanitizer = (data: any) => data; // Mock sanitizer
    const payload = haikuIpiSanitizer(rawPayload);

    console.log("Received WhatsApp payload:", payload);

    // Call the native agent BAU to process the message logic
    // This is a stub calling executeNativeTool
    const result = await executeNativeTool("shell", { cmd: "echo 'WhatsApp Event processed'" });
    console.log("Agent result:", result);

    return new Response(JSON.stringify({ status: "ok", processed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
