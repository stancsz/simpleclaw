import { startClaw } from "../src/index.ts";

async function runWorker() {
  console.log("Starting Managed SimpleClaw Worker...");

  let configOverride = {};

  if (process.env.MANAGEMENT_API_URL && process.env.MANAGEMENT_API_KEY) {
    try {
      console.log(`Fetching remote configuration from ${process.env.MANAGEMENT_API_URL}...`);
      const res = await fetch(`${process.env.MANAGEMENT_API_URL}/api/config`, {
        headers: {
          Authorization: `Bearer ${process.env.MANAGEMENT_API_KEY}`,
        },
      });

      if (res.ok) {
        configOverride = await res.json();
        console.log("Successfully fetched remote configuration.");
      } else {
        console.error(`Failed to fetch remote config: ${res.status} ${res.statusText}`);
      }
    } catch (error) {
      console.error("Error fetching remote configuration:", error);
    }
  } else {
    console.warn("No MANAGEMENT_API_URL or MANAGEMENT_API_KEY provided. Running in standalone mode.");
  }

  // Initialize the core with the remote configuration
  await startClaw(configOverride);
}

runWorker().catch(console.error);