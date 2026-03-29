import { NextRequest } from "next/server";
import { getDbClient } from "@/../../src/db/client";
import { handleHeartbeat } from "@/../../src/core/heartbeat";

export async function POST(req: NextRequest) {
    try {
        const db = getDbClient();

        // This simulates a cron trigger hitting the endpoint,
        // which then triggers processHeartbeat to check for pending triggers
        await handleHeartbeat(db);

        return Response.json({ status: "success", message: "Heartbeat processed successfully" }, { status: 200 });
    } catch (error) {
        console.error("Error in heartbeat route:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
