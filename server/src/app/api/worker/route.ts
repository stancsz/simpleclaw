import { NextRequest } from "next/server";
import { getDbClient } from "../../../../../src/db/client";
import { executeWorkerTask } from "../../../../../src/workers/template";
import { executeGithubWorkerTask } from "../../../../../src/workers/github.worker";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { task, session_id } = body;

        if (!task || !session_id) {
            return Response.json({ error: "Missing task or session_id" }, { status: 400 });
        }

        const db = getDbClient();

        let result;
        if (task.worker === "github") {
            result = await executeGithubWorkerTask(task, session_id, db);
        } else {
            result = await executeWorkerTask(task, session_id, db);
        }

        return Response.json({ status: "success", result }, { status: 200 });
    } catch (error: any) {
        console.error("Error in worker API route:", error);
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
