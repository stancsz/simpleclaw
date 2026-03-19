// Phase 1 - BYOK UI Key Deletion Route
import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "../../../../../../src/db/client";

const getUserId = (req: NextRequest): string => {
  // This is a placeholder - will be replaced with real auth
  return 'test-user';
};

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = (await params).id;

        // BYOK Phase 1 validation
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
