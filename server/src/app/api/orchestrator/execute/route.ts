import { NextRequest } from "next/server";
import { executePlan } from "../../../../../../src/core/orchestrator";
import { getDbClient } from "../../../../../../src/db/client";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const sessionId = body.session_id || body.sessionId;
        let manifest = body.manifest;

        if (!sessionId) {
            return Response.json({ error: "Missing sessionId" }, { status: 400 });
        }

        const db = getDbClient();
        let session = db.getSession(sessionId);

        if (!session) {
            console.warn("Session not found in DB (likely running in Next.js stub DBClient), falling back to provided manifest.");
        } else {
            manifest = session.manifest || manifest;
        }

        if (!manifest) {
            return Response.json({ error: "Manifest not provided and could not be found in session" }, { status: 400 });
        }

        db.updateSessionStatus(sessionId, "approved");

        // Execute the plan asynchronously to allow the UI to poll
        executePlan(manifest, sessionId, db).catch(() => {});

        return Response.json({ status: "success", executionId: sessionId }, { status: 202 });

    } catch (error) {
        console.error("Error in execute API route:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
