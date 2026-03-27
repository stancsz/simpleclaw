import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { POST, GET } from "./route";

// Mock dependencies
const mockWriteAuditLog = mock(() => {});
const mockUpdateSessionStatus = mock(() => {});
const mockGetTaskResults = mock(() => [{ worker_id: "w1", status: "completed" }]);
const mockGetSession = mock(() => ({ status: "completed" }));

mock.module("@/../../src/db/client", () => {
    return {
        getDbClient: () => ({
            writeAuditLog: mockWriteAuditLog,
            updateSessionStatus: mockUpdateSessionStatus,
            getTaskResults: mockGetTaskResults,
            getSession: mockGetSession,
            getGasBalance: mock(() => 10), // Mock 10 gas credits
            run: mock(() => {}),
            query: mock(() => ({ get: () => ({}), all: () => [] })),
            transaction: mock((cb) => cb()),
        }),
        DBClient: class {
            constructor() {}
            writeAuditLog = mockWriteAuditLog;
            updateSessionStatus = mockUpdateSessionStatus;
            getTaskResults = mockGetTaskResults;
            getSession = mockGetSession;
            getGasBalance = mock(() => 10);
            run = mock(() => {});
            query = mock(() => ({ get: () => ({}), all: () => [] }));
            transaction = mock((cb) => cb());
        }
    };
});

// Since executeSwarmManifest is asynchronous and catches internally in our route,
// we just need it to resolve successfully to avoid unhandled rejections in tests.
mock.module("@/../../src/core/dispatcher", () => {
    return {
        executeSwarmManifest: mock(async () => {
            return { "step1": { status: "success" } };
        })
    };
});

describe("Orchestrator API Route", () => {
    beforeEach(() => {
        mockWriteAuditLog.mockClear();
        mockUpdateSessionStatus.mockClear();
        mockGetTaskResults.mockClear();
        mockGetSession.mockClear();
    });

    it("should handle POST with action='approve' and dispatch workers", async () => {
        const payload = {
            action: "approve",
            user_id: "test-user-id",
            session_id: "test-session-123"
        };
        // The orchestrator relies on dbClient.getSession returning a valid session with a manifest
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

        const req = new NextRequest("http://localhost/api/orchestrator", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe("dispatched");
        expect(data.executionId).toBe("test-session-123");
        expect(data.workers).toEqual(["mock-worker"]);

        // Ensure session status was updated
        expect(mockUpdateSessionStatus).toHaveBeenCalledWith("test-session-123", "approved");
    });

    it("should return 400 on POST with action='approve' but missing sessionId", async () => {
        const payload = {
            action: "approve",
            user_id: "test-user-id",
            manifest: {}
        };

        const req = new NextRequest("http://localhost/api/orchestrator", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("Missing or invalid \"session_id\"");
    });

    it("should handle GET and return task results", async () => {
        const req = new NextRequest("http://localhost/api/orchestrator?sessionId=test-session-123", {
            method: "GET"
        });

        const response = await GET(req);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe("success");
        expect(data.results).toEqual([{ worker_id: "w1", status: "completed" }]);
        expect(data.sessionStatus).toBe("completed");

        expect(mockGetTaskResults).toHaveBeenCalledWith("test-session-123");
        expect(mockGetSession).toHaveBeenCalledWith("test-session-123");
    });

    it("should return 400 on GET if sessionId is missing", async () => {
        const req = new NextRequest("http://localhost/api/orchestrator", {
            method: "GET"
        });

        const response = await GET(req);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Missing sessionId");
    });
});
