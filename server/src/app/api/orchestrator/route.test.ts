import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

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
        }),
        DBClient: class {
            constructor() {}
            writeAuditLog = mockWriteAuditLog;
            updateSessionStatus = mockUpdateSessionStatus;
            getSession = mockGetSession;
            run = mock(() => {});
            query = mock(() => ({ get: () => ({}), all: () => [] }));
            transaction = mock((cb) => cb());
        }
    };
});

describe("Orchestrator API Route", () => {
    beforeEach(() => {
        mockWriteAuditLog.mockClear();
        mockUpdateSessionStatus.mockClear();
        mockGetSession.mockClear();
    });

    it("should return 400 on POST if prompt is missing", async () => {
        const payload = {
            user_id: "test-user-id"
        };
        const req = new NextRequest("http://localhost/api/orchestrator", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("Missing or invalid \"prompt\"");
    });
});
