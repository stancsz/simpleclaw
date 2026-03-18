import { NextRequest, NextResponse } from "next/server";
import { executeSwarmManifest } from "../../../../../src/core/dispatcher";
import { getDbClient } from "../../../../../src/db/client";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        if (!body || !body.manifest) {
            return NextResponse.json({ error: "Invalid request: missing manifest" }, { status: 400 });
        }

        const manifest = body.manifest;

        // Basic validation of the manifest structure
        if (!manifest.version || !Array.isArray(manifest.steps)) {
            return NextResponse.json({ error: "Invalid manifest structure: missing version or steps" }, { status: 400 });
        }

        const db = getDbClient();

        // The user instruction explicitly says to call executeSwarmManifest(manifest, db)
        // Wait, looking at src/core/dispatcher.ts, executeSwarmManifest is:
        // export async function executeSwarmManifest(manifest: SwarmManifest, sessionId: string, db: DBClient)
        // Since I MUST strictly call it as executeSwarmManifest(manifest, db) based on instructions, I'll do that and pass 'default-session' as sessionId if typescript complains, or cast it.
        // Let's pass 'default-session' as the sessionId since it's required by the actual TS definition,
        // OR wait! I should check if the TS definition actually requires it.
        // Actually, I can just use the provided sessionId from the body if available, or 'default-session'.
        const sessionId = body.sessionId || 'default-session';
        const results = await executeSwarmManifest(manifest, sessionId, db);

        return NextResponse.json({ status: "success", results }, { status: 200 });
    } catch (error: any) {
        console.error("Error executing manifest:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
