import { DBClient } from "../src/db/client";
import { join } from "path";

const API_URL = "http://localhost:3000/api/heartbeat";
const INTERVAL_MS = 30000;

console.log("Starting SimpleClaw Local Heartbeat Simulator...");

// Initialize DB Client with local SQLite path (same as tests)
const dbPath = join(process.cwd(), "local.db");
const db = new DBClient(`sqlite://${dbPath}`);

console.log(`Connected to database at ${dbPath}`);

async function pollHeartbeat() {
    try {
        const activeSessions = db.getActiveContinuousSessions();

        if (activeSessions.length === 0) {
            console.log(`[${new Date().toISOString()}] No active Continuous Mode sessions found.`);
            return;
        }

        console.log(`[${new Date().toISOString()}] Found ${activeSessions.length} active session(s). Triggering heartbeat...`);

        for (const session of activeSessions) {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: session.id })
            });

            if (!res.ok) {
                console.error(`[${new Date().toISOString()}] Failed to trigger heartbeat for session ${session.id}: ${res.statusText}`);
            } else {
                console.log(`[${new Date().toISOString()}] Heartbeat triggered successfully for session ${session.id}`);
            }
        }
    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] Simulator error:`, error.message);
    }
}

// Start scheduler running every 30 seconds
setInterval(pollHeartbeat, INTERVAL_MS);

console.log(`Heartbeat simulator running. Polling database and hitting ${API_URL} every ${INTERVAL_MS / 1000} seconds...`);
console.log("Press Ctrl+C to stop.");
