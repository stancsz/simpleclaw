import { NextRequest } from "next/server";
import { getDbClient } from "../../../../../src/db/client";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('session_id');

        if (!sessionId) {
            return Response.json({ error: "Missing session_id" }, { status: 400 });
        }

        const db = getDbClient();
        const results = db.getTaskResults(sessionId);

        // Parse JSON output if present
        const parsedResults = results.map(row => {
            let output = row.output;
            if (output) {
                try {
                    output = JSON.parse(output);
                } catch (e) {
                    // keep as string
                }
            }
            return {
                ...row,
                output
            };
        });

        return Response.json({ status: "success", results: parsedResults }, { status: 200 });
    } catch (error: any) {
        console.error("Error in status API route:", error);
        return Response.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
