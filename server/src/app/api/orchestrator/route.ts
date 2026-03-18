import { NextRequest } from "next/server";
import { orchestratorHandler } from "../../../../../src/core/orchestrator";
import { executeSwarmManifest } from "../../../../../src/core/dispatcher";
import { getDbClient } from "../../../../../src/db/client";
import type { Request, Response } from "@google-cloud/functions-framework";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Intercept approval action to handle it asynchronously
        if (body.action === 'approve') {
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
            executeSwarmManifest(manifest, sessionId, db)
                .then(() => {
                    db.updateSessionStatus(sessionId, "completed");
                })
                .catch((error: any) => {
                    console.error("Error in async executeSwarmManifest:", error);
                    db.updateSessionStatus(sessionId, "error");
                    db.writeAuditLog(sessionId, "swarm_execution_failed", { error: error.message || String(error) });
                });

            return Response.json({ status: "success", executionId: sessionId }, { status: 200 });
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
