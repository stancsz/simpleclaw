import { NextRequest } from "next/server";
import { orchestratorHandler } from "@/../../src/core/orchestrator";
import { getDbClient } from "@/../../src/db/client";
import { executeSwarmManifest } from "@/../../src/core/dispatcher";
import type { Request, Response } from "@google-cloud/functions-framework";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        if (body.action === 'approve') {
            const { session_id, user_id, action } = body;

            if (!session_id || typeof session_id !== 'string') {
                return Response.json({ error: 'Missing or invalid "session_id" field for execution.' }, { status: 400 });
            }

            const dbClient = getDbClient();
            const session = dbClient.getSession(session_id);

            if (!session) {
                return Response.json({ error: `Session not found for id: ${session_id}` }, { status: 404 });
            }

            const manifest = session.manifest;
            if (!manifest) {
                return Response.json({ error: 'No manifest associated with this session.' }, { status: 400 });
            }

            dbClient.updateSessionStatus(session_id, 'executing');

            // Dispatch worker execution asynchronously so the UI can immediately poll for results
            executeSwarmManifest(manifest, session_id, dbClient).catch((err) => {
                console.error('Error in asynchronous executeSwarmManifest:', err);
                dbClient.updateSessionStatus(session_id, 'error');
                dbClient.writeAuditLog(session_id, 'swarm_execution_failed', { error: err.message || String(err) });
            });

            return Response.json({
                status: 'dispatched',
                executionId: session_id,
                message: 'Session approved and execution started.',
                workers: manifest.steps?.map((s: any) => s.worker) || []
            }, { status: 200 });
        }

        // Create mock Request and Response objects to interface with the GCF handler
        const mockReq = {
            method: "POST",
            body: body
        } as Request;

        let statusCode = 200;
        let responseBody: any = null;

        const mockRes = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return mockRes;
            },
            json: (data: any) => {
                responseBody = data;
            },
            send: (data: string) => {
                responseBody = data;
            }
        } as Response;

        // Call the orchestrator handler
        await orchestratorHandler(mockReq, mockRes);

        return Response.json(responseBody, { status: statusCode });
    } catch (error) {
        console.error("Error in orchestrator API route:", error);
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
