import { DBClient } from "../src/db/client";
import { startLocalScheduler } from "../src/core/heartbeat";

console.log("Starting SimpleClaw Local Heartbeat Simulator...");

// Initialize DB Client
const db = new DBClient(process.env.DATABASE_URL || "sqlite://local.db");

// The Next.js API server typically runs on port 3000 locally
const NEXTJS_BASE_URL = process.env.NEXTJS_BASE_URL || "http://localhost:3000";

// Start scheduler running every 30 seconds (30000 ms)
startLocalScheduler(db, NEXTJS_BASE_URL, 30000);

console.log(`Heartbeat simulator running. Checking queue every 30 seconds against ${NEXTJS_BASE_URL}...`);
