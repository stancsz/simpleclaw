import { NextRequest } from "next/server";
import { getDbClient } from "@/../../src/db/client";
import { executeSwarmManifest } from "@/../../src/core/dispatcher";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        // Fallback to sessionId if session_id is not provided, matching UI payload behavior
        const sessionId = body.session_id || body.sessionId;

        if (!sessionId || typeof sessionId !== 'string') {
            return Response.json({ error: 'Missing or invalid "session_id" field for execution.' }, { status: 400 });
        }

        const dbClient = getDbClient();

        const session = dbClient.getSession(sessionId);
        if (!session) {
            return Response.json({ error: `Session not found for id: ${sessionId}` }, { status: 404 });
        }

        const manifest = session.manifest || body.manifest;
        if (!manifest) {
            return Response.json({ error: 'No manifest associated with this session.' }, { status: 400 });
        }

        dbClient.updateSessionStatus(sessionId, 'executing');

        // Dispatch worker execution asynchronously so the UI can immediately poll for results
        executeSwarmManifest(manifest, sessionId, dbClient).catch((err) => {
            console.error('Error in asynchronous executeSwarmManifest:', err);
            dbClient.updateSessionStatus(sessionId, 'error');
            dbClient.writeAuditLog(sessionId, 'swarm_execution_failed', { error: err.message || String(err) });
        });

        return Response.json({
            status: 'dispatched',
            executionId: sessionId,
            message: 'Session approved and execution started.',
            workers: manifest.steps?.map((s: any) => s.worker) || []
        }, { status: 200 });
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
