import { runAgentLoop } from "../src/core/agent.ts";

const msg = process.argv.slice(2).join(" ");
if (!msg) {
  console.error("Please provide a message");
  process.exit(1);
}

console.log(`🤖 Sending message to SimpleClaw: ${msg}`);
const result = await runAgentLoop(msg);
console.log("\n--- AGENT RESPONSE ---");
console.log(result.content);
console.log("----------------------");
