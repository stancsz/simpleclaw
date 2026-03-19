// Phase 1 - BYOK UI API Route
// Handles CRUD operations for Bring Your Own Key management,
// securely encrypting keys via KMS before storing in Supabase Vault.
import { NextRequest } from "next/server";
import { getDbClient } from "../../../../../src/db/client";
import { getKMSProvider } from "../../../../../src/security/kms";

const MOCK_USER_ID = 'test-user'; // Minimal auth for Phase 0 / Phase 1 local development

export async function GET(req: NextRequest) {
    try {
        const dbClient = getDbClient();
        const kmsProvider = getKMSProvider();

        // 1. Fetch user's platform record to verify they exist
        const platformUser = dbClient.getPlatformUser(MOCK_USER_ID);
        if (!platformUser) {
            // For local testing, if the platform user doesn't exist, we just return empty
            // (or we could auto-create one for dev purposes, but returning empty list is safer)
            return Response.json({ keys: [] }, { status: 200 });
        }

        // 2. Fetch encrypted secrets from db
        const rawSecrets = dbClient.getSecrets(MOCK_USER_ID);

        // 3. Decrypt secrets to create dynamic masks
        const keys = await Promise.all(rawSecrets.map(async (secretObj) => {
            try {
                // In a real system we'd decrypt the service_role and connect to Supabase
                // Here we use the local KMS to directly decrypt the simulated pgsodium column
                const decryptedKey = await kmsProvider.decrypt(secretObj.secret);

                // Create mask showing only last 4 chars
                const maskLength = Math.max(0, decryptedKey.length - 4);
                const maskedKey = maskLength > 0
                    ? `sk-...${decryptedKey.substring(decryptedKey.length - 4)}`
                    : 'sk-...';

                return {
                    id: secretObj.id,
                    name: secretObj.name,
                    provider: secretObj.provider,
                    expiresAt: secretObj.expiresAt,
                    maskedKey: maskedKey,
                    createdAt: secretObj.createdAt
                };
            } catch (err) {
                console.error(`Failed to decrypt secret ${secretObj.id}:`, err);
                return {
                    id: secretObj.id,
                    name: secretObj.name,
                    provider: secretObj.provider,
                    expiresAt: secretObj.expiresAt,
                    maskedKey: 'sk-...error',
                    createdAt: secretObj.createdAt
                };
            }
        }));

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

        const dbClient = getDbClient();
        const kmsProvider = getKMSProvider();

        // Ensure user exists in platform_users
        let platformUser = dbClient.getPlatformUser(MOCK_USER_ID);
        if (!platformUser) {
            // Auto-onboard for local dev if missing
            const mockServiceRole = await kmsProvider.encrypt('mock-service-role-key');
            dbClient.setPlatformUser(MOCK_USER_ID, 'http://localhost:54321', mockServiceRole);
        }

        // Encrypt the API key (simulating pgsodium via our KMS)
        const encryptedKey = await kmsProvider.encrypt(key);

        const secretName = name || `${provider}-key`;

        // Store the encrypted key in the vault
        const secretId = dbClient.addSecret(MOCK_USER_ID, secretName, encryptedKey, provider, expiresAt);

        return Response.json({ id: secretId, success: true }, { status: 201 });
    } catch (error: any) {
        console.error("Error adding key:", error);
        return Response.json({ error: "Failed to add key" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const secretId = url.searchParams.get("id");

        if (!secretId) {
            return Response.json({ error: "Secret ID is required" }, { status: 400 });
        }

        const dbClient = getDbClient();
        dbClient.deleteSecret(MOCK_USER_ID, secretId);

        return Response.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error("Error deleting key:", error);
        return Response.json({ error: "Failed to delete key" }, { status: 500 });
    }
}
