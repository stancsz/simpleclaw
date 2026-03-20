// Phase 1 - BYOK UI API Route
// Handles CRUD operations for Bring Your Own Key management,
// securely encrypting keys via KMS before storing in Supabase Vault.
import { NextRequest } from "next/server";
import { getKeys, addKey } from "@/lib/keyService";

export async function GET(req: NextRequest) {
    try {
        const keys = await getKeys();
        return Response.json({ keys }, { status: 200 });
    } catch (error: any) {
        console.error("Error fetching keys:", error);
        return Response.json({ error: "Failed to fetch keys" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { provider, key, name, expiresAt } = body;

        // BYOK Phase 1 validation
        if (!provider || !key) {
            return Response.json({ error: "Provider and key are required" }, { status: 400 });
        }

        const secretId = await addKey(provider, key, name, expiresAt);

        return Response.json({ id: secretId, success: true }, { status: 201 });
    } catch (error: any) {
        console.error("Error adding key:", error);
        return Response.json({ error: "Failed to add key" }, { status: 500 });
    }
}
