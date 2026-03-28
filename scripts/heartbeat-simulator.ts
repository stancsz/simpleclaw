import { DBClient } from "../src/db/client";
import { startLocalScheduler } from "../src/core/heartbeat";
import { join } from "path";

console.log("Starting SimpleClaw Local Heartbeat Simulator...");

// Initialize DB Client with local SQLite path (same as tests)
const dbPath = join(process.cwd(), "local.db");
const db = new DBClient(`sqlite://${dbPath}`);

console.log(`Connected to database at ${dbPath}`);

// Start scheduler running every 30 seconds (30000 ms)
startLocalScheduler(db, 30000);

console.log("Heartbeat simulator running. Checking queue every 30 seconds...");
console.log("Press Ctrl+C to stop.");
