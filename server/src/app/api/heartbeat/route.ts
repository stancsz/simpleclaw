import { NextRequest } from "next/server";
import { getDbClient } from "@/../../src/db/client";
import { handleHeartbeat, processAllHeartbeats } from "@/../../src/core/heartbeat";

export async function POST(req: NextRequest) {
    try {
        const url = new URL(req.url);
        let sessionId = url.searchParams.get("session_id");

        try {
            const body = await req.json();
            if (body && body.sessionId) {
                sessionId = body.sessionId;
            } else if (body && body.session_id) {
                sessionId = body.session_id;
            }
        } catch (e) {
            // Ignored, might not have a body
        }

        const db = getDbClient();

        if (sessionId) {
            // Process a specific session
            await handleHeartbeat(sessionId, db);
        } else {
            // This simulates a cron trigger hitting the endpoint without session_id,
            // which then triggers processAllHeartbeats to check for all pending triggers
            await processAllHeartbeats(db);
        }

        return Response.json({ status: "success", message: "Heartbeat processed successfully" }, { status: 200 });
    } catch (error) {
        console.error("Error in heartbeat route:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
