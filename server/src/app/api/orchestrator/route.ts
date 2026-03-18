import { NextRequest } from "next/server";
import { orchestratorHandler } from "../../../../../src/core/orchestrator";
import type { Request, Response } from "@google-cloud/functions-framework";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

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
