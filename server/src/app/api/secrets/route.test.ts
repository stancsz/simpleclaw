import { expect, test, mock, describe, beforeEach } from "bun:test";
import { GET, POST, DELETE } from "./route";
import { NextRequest } from "next/server";

// Mock the DBClient
const mockDb = {
    getSecrets: mock(() => []),
    addSecret: mock(() => "mock-secret-id"),
    deleteSecret: mock(() => {})
};

mock.module("@/../../src/db/client", () => ({
    getDbClient: () => mockDb
}));

describe("Secrets API", () => {
    beforeEach(() => {
        mockDb.getSecrets.mockClear();
        mockDb.addSecret.mockClear();
        mockDb.deleteSecret.mockClear();
    });

    test("GET /api/secrets should return secrets", async () => {
        mockDb.getSecrets.mockReturnValueOnce([
            { id: "1", name: "Test Key", provider: "OpenAI", maskedKey: "sk-...", createdAt: new Date().toISOString() }
        ]);

        const req = new NextRequest("http://localhost:3000/api/secrets");
        const res = await GET(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.secrets).toBeArray();
        expect(data.secrets.length).toBe(1);
        expect(data.secrets[0].id).toBe("1");
    });

    test("POST /api/secrets should add a secret and return its id", async () => {
        const body = {
            provider: "OpenAI",
            key: "sk-test1234",
            name: "My OpenAI Key",
            expiresAt: "2024-12-31"
        };
        const req = new NextRequest("http://localhost:3000/api/secrets", {
            method: "POST",
            body: JSON.stringify(body)
        });

        const res = await POST(req);

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.id).toBe("mock-secret-id");
        expect(mockDb.addSecret).toHaveBeenCalledWith("test-user", "My OpenAI Key", "sk-test1234", "OpenAI", "2024-12-31");
    });

    test("POST /api/secrets should return 400 if provider or key is missing", async () => {
        const body = { provider: "OpenAI" }; // Missing key
        const req = new NextRequest("http://localhost:3000/api/secrets", {
            method: "POST",
            body: JSON.stringify(body)
        });

        const res = await POST(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Provider and key are required");
        expect(mockDb.addSecret).not.toHaveBeenCalled();
    });

    test("DELETE /api/secrets should delete a secret", async () => {
        const req = new NextRequest("http://localhost:3000/api/secrets?id=mock-secret-id", {
            method: "DELETE"
        });

        const res = await DELETE(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(mockDb.deleteSecret).toHaveBeenCalledWith("test-user", "mock-secret-id");
    });

    test("DELETE /api/secrets should return 400 if id is missing", async () => {
        const req = new NextRequest("http://localhost:3000/api/secrets", {
            method: "DELETE"
        });

        const res = await DELETE(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Secret ID is required");
        expect(mockDb.deleteSecret).not.toHaveBeenCalled();
    });
});
