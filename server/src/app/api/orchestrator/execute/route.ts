import { NextRequest } from "next/server";
import { executeSwarmManifest } from "../../../../../src/core/dispatcher";
import { getDbClient } from "../../../../../src/db/client";

export async function POST(req: NextRequest) {
    let sessionId: string | undefined;
    const db = getDbClient();

    try {
        const body = await req.json();
        // UI passes sessionId as per the updated instruction
        sessionId = body.sessionId;

        if (!sessionId) {
            return Response.json({ error: "Missing sessionId" }, { status: 400 });
        }

        let session = db.getSession(sessionId);
        let manifest = body.manifest;

        if (!session) {
            console.warn("Session not found in DB (likely running in Next.js stub DBClient), falling back to provided manifest.");
        } else {
            manifest = session.manifest || manifest;
        }

        if (!manifest) {
            return Response.json({ error: "Manifest not provided and could not be found in session" }, { status: 400 });
        }

        db.updateSessionStatus(sessionId, "approved");

        // Execute the plan
        const results = await executeSwarmManifest(manifest, sessionId, db);

        // Convert the record to an array of results for the frontend
        const taskResults = Object.values(results);

        // Update session status to completed
        db.updateSessionStatus(sessionId, "completed");

        return Response.json({ status: "success", results: taskResults }, { status: 200 });
    } catch (error: any) {
        console.error("Error in execute API route:", error);

        if (sessionId) {
            try {
                db.updateSessionStatus(sessionId, "error");
                db.writeAuditLog(sessionId, "swarm_execution_failed", { error: error.message || String(error) });
            } catch (dbError) {
                console.error("Error updating session status on failure:", dbError);
            }
        }

        return Response.json({ error: error.message || "Internal server error" }, { status: 500 });
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
