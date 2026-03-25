import { describe, it, expect, mock, beforeEach } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Mock dependencies
const mockWriteAuditLog = mock(() => {});
const mockUpdateSessionStatus = mock(() => {});
const mockGetSession = mock(() => ({ status: "completed" }));

mock.module("@/../../src/db/client", () => {
    return {
        getDbClient: () => ({
            writeAuditLog: mockWriteAuditLog,
            updateSessionStatus: mockUpdateSessionStatus,
            getSession: mockGetSession,
            run: mock(() => {}),
            query: mock(() => ({ get: () => ({}), all: () => [] })),
            transaction: mock((cb) => cb()),
        })
    };
});

mock.module("@/../../src/core/dispatcher", () => {
    return {
        executeSwarmManifest: mock(async () => {
            return { "step1": { status: "success" } };
        })
    };
});

describe("Orchestrator Approve API Route", () => {
    beforeEach(() => {
        mockWriteAuditLog.mockClear();
        mockUpdateSessionStatus.mockClear();
        mockGetSession.mockClear();
    });

    it("should handle POST and dispatch workers", async () => {
        const payload = {
            session_id: "test-session-123"
        };

        mockGetSession.mockReturnValueOnce({
            status: "waiting_approval",
            manifest: {
                version: "1.0",
                intent_parsed: "test intent",
                skills_required: [],
                credentials_required: [],
                steps: [
                    { id: "step1", worker: "mock-worker", skills: [], credentials: [], depends_on: [], action_type: "READ", description: "test" }
                ]
            }
        });

        const req = new NextRequest("http://localhost/api/orchestrator/approve", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe("dispatched");
        expect(data.executionId).toBe("test-session-123");
        expect(data.workers).toEqual(["mock-worker"]);

        expect(mockUpdateSessionStatus).toHaveBeenCalledWith("test-session-123", "executing");
    });

    it("should return 400 on POST but missing sessionId", async () => {
        const payload = {
            manifest: {}
        };

        const req = new NextRequest("http://localhost/api/orchestrator/approve", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("Missing or invalid \"session_id\"");
    });
});
