import { NextRequest } from "next/server";
import { getDbClient } from "@/../../src/db/client";
import { executePlan } from "@/../../src/core/orchestrator";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const sessionId = body?.sessionId;

        if (!sessionId || typeof sessionId !== 'string') {
            return Response.json({ error: 'Missing or invalid "sessionId" field in request body.' }, { status: 400 });
        }

        const dbClient = getDbClient();
        const session = dbClient.getSession(sessionId);

        if (!session) {
            return Response.json({ error: `Session not found for id: ${sessionId}` }, { status: 404 });
        }

        const manifest = session.manifest;
        if (!manifest) {
            return Response.json({ error: 'No manifest associated with this session.' }, { status: 400 });
        }

        dbClient.updateSessionStatus(sessionId, 'approved');

        // Execute the plan asynchronously so the UI can poll for results
        executePlan(manifest, sessionId, dbClient).catch((err) => {
            console.error('Error in executePlan:', err);
        });

        return Response.json({
            success: true,
            executionId: sessionId,
            message: 'Session approved and execution started.',
            workers: manifest.steps?.map((s: any) => s.worker) || []
        }, { status: 200 });

    } catch (error: any) {
        console.error('Error in approve API route:', error);
        return Response.json({ error: error.message || 'Internal server error while starting execution.' }, { status: 500 });
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
