import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "@/../../src/db/client";

// MOCK user id for phase 1
const MOCK_USER_ID = "test-user";

export async function GET(req: NextRequest) {
    try {
        const dbClient = getDbClient();
        const secrets = dbClient.getSecrets(MOCK_USER_ID);
        return NextResponse.json({ secrets }, { status: 200 });
    } catch (error: any) {
        console.error("Error fetching secrets:", error);
        return NextResponse.json({ error: "Failed to fetch secrets" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { provider, key, name, expiresAt } = body;

        if (!provider || !key) {
            return NextResponse.json({ error: "Provider and key are required" }, { status: 400 });
        }

        const dbClient = getDbClient();

        // For Phase 1 we just store plaintext directly using addSecret
        // In reality, this would use KMS encryption
        const secretName = name || `${provider}-key`;
        const secretId = dbClient.addSecret(MOCK_USER_ID, secretName, key, provider, expiresAt);

        return NextResponse.json({ id: secretId, success: true }, { status: 201 });
    } catch (error: any) {
        console.error("Error adding secret:", error);
        return NextResponse.json({ error: "Failed to add secret" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const id = url.searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: "Secret ID is required" }, { status: 400 });
        }

        const dbClient = getDbClient();
        dbClient.deleteSecret(MOCK_USER_ID, id);

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error("Error deleting secret:", error);
        return NextResponse.json({ error: "Failed to delete secret" }, { status: 500 });
    }
}
