// Phase 1 - BYOK UI Key Deletion Route
import { NextRequest, NextResponse } from "next/server";
import { deleteKey } from "@/lib/keyService";

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

        await deleteKey(id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting key:", error);
        return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
    }
}
