import { describe, it, expect, mock, beforeEach } from "bun:test";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockGetTaskResults = mock(() => [{ worker_id: "w1", status: "completed" }]);
const mockGetSession = mock(() => ({ status: "completed" }));

mock.module("@/../../src/db/client", () => {
    return {
        getDbClient: () => ({
            getTaskResults: mockGetTaskResults,
            getSession: mockGetSession,
        })
    };
});

describe("Orchestrator Status API Route", () => {
    beforeEach(() => {
        mockGetTaskResults.mockClear();
        mockGetSession.mockClear();
    });

    it("should handle GET and return task results", async () => {
        const req = new NextRequest("http://localhost/api/orchestrator/status/test-session-123", {
            method: "GET"
        });

        const response = await GET(req, { params: Promise.resolve({ sessionId: "test-session-123" }) });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe("success");
        expect(data.results).toEqual([{ worker_id: "w1", status: "completed" }]);
        expect(data.sessionStatus).toBe("completed");

        expect(mockGetTaskResults).toHaveBeenCalledWith("test-session-123");
        expect(mockGetSession).toHaveBeenCalledWith("test-session-123");
    });

    it("should return 400 on GET if sessionId is missing", async () => {
        const req = new NextRequest("http://localhost/api/orchestrator/status/", {
            method: "GET"
        });

        const response = await GET(req, { params: Promise.resolve({ sessionId: "" }) });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Missing sessionId");
    });
});
