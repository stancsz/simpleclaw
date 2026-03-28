import { DBClient } from "../db/client";

export async function processHeartbeats(db: DBClient, baseUrl: string) {
    const pending = db.getPendingHeartbeats();

    for (const heartbeat of pending) {
        // Update status so we don't process it multiple times in parallel loops
        db.updateHeartbeatStatus(heartbeat.id, 'processing');

        try {
            const res = await fetch(`${baseUrl}/api/heartbeat?sessionId=${heartbeat.session_id}`, {
                method: 'POST'
            });

            if (!res.ok) {
                console.error(`Heartbeat failed for session ${heartbeat.session_id} with status ${res.status}`);
                db.updateHeartbeatStatus(heartbeat.id, 'error');
            } else {
                db.updateHeartbeatStatus(heartbeat.id, 'completed');
            }
        } catch (error) {
            console.error(`Error processing heartbeat for session ${heartbeat.session_id}:`, error);
            db.updateHeartbeatStatus(heartbeat.id, 'error');
        }
    }
}

// Simple local polling loop for development purposes. In production this would be replaced by pg_cron.
export function startLocalScheduler(db: DBClient, baseUrl: string, intervalMs: number = 60000) {
    console.log(`Starting local heartbeat scheduler running every ${intervalMs}ms`);

    setInterval(() => {
        processHeartbeats(db, baseUrl).catch(err => {
            console.error("Local scheduler loop error:", err);
        });
    }, intervalMs);
}
