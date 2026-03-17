import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "../../../../../src/db/client";
import { getKMSProvider } from "../../../../../src/security/kms";

// TODO: Replace with real auth once authentication is implemented
// For now, use session from cookie or default to test-user
const getUserId = (req: NextRequest): string => {
  // This is a placeholder - will be replaced with real auth
  return 'test-user';
};

export async function GET(req: NextRequest) {
    try {
        const userId = getUserId(req);
        const dbClient = getDbClient();
        const keys = dbClient.getSecrets(userId);

        return NextResponse.json({ keys });
    } catch (error) {
        console.error("Error fetching keys:", error);
        return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { provider, secret, name } = body;

        if (!provider || !secret) {
            return NextResponse.json({ error: "Provider and secret are required" }, { status: 400 });
        }

        const kmsProvider = getKMSProvider();
        const encryptedSecret = await kmsProvider.encrypt(secret);

        const keyName = name || `${provider}_key`;

        const userId = getUserId(req);
        const dbClient = getDbClient();
        const id = dbClient.addSecret(userId, keyName, encryptedSecret, provider);

        if (!id) {
            throw new Error("Failed to add secret to DB");
        }

        return NextResponse.json({ success: true, id });
    } catch (error) {
        console.error("Error adding key:", error);
        return NextResponse.json({ error: "Failed to add key" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Key ID is required" }, { status: 400 });
        }

        const userId = getUserId(req);
        const dbClient = getDbClient();
        dbClient.deleteSecret(userId, id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting key:", error);
        return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
    }
}
