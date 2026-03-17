import { NextRequest } from "next/server";
import { getDbClient } from "../../../../../src/db/client";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get("sessionId");

        if (!sessionId) {
            return Response.json({ error: "Missing sessionId" }, { status: 400 });
        }

        const db = getDbClient();
        const results = db.getTaskResults(sessionId);
        const session = db.getSession(sessionId);

        return Response.json({ status: "success", results, sessionStatus: session?.status || "unknown" }, { status: 200 });
    } catch (error) {
        console.error("Error in results API route:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
