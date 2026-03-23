// Note: This endpoint is deprecated in favor of the existing /api/keys endpoint
// which already has full KMS integration and proper user isolation.
// Redirecting to maintain API compatibility during transition.

import { NextRequest, NextResponse } from "next/server";
import { redirect } from 'next/navigation';

export async function GET(req: NextRequest) {
    // Redirect to the existing keys API
    return NextResponse.redirect(new URL('/api/keys', req.url));
}

export async function POST(req: NextRequest) {
    // Redirect to the existing keys API
    return NextResponse.redirect(new URL('/api/keys', req.url), 307);
}

export async function DELETE(req: NextRequest) {
    // Redirect to the existing keys API
    return NextResponse.redirect(new URL('/api/keys', req.url), 307);
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
