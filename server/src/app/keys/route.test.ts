import { describe, expect, test, mock, beforeEach } from "bun:test";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "../api/keys/route";
import * as routeId from "../api/keys/[id]/route";

const mockDb = {
    getPlatformUser: mock(() => ({ user_id: 'test-user', supabase_url: 'http://localhost:54321', encrypted_service_role: 'enc' })),
    setPlatformUser: mock(() => {}),
    getSecrets: mock(() => [
        { id: '1', name: 'my-openai-key', secret: 'enc-openai-sk-1234', provider: 'OpenAI', expiresAt: '2027-01-01', createdAt: '2024-01-01' },
    ]),
    addSecret: mock(() => 'new-secret-id'),
    deleteSecret: mock(() => {})
};

mock.module('@/../../src/db/client', () => {
    return {
        getDbClient: () => mockDb,
        DBClient: class {
            constructor() {}
            getPlatformUser = mockDb.getPlatformUser;
            setPlatformUser = mockDb.setPlatformUser;
            getSecrets = mockDb.getSecrets;
            addSecret = mockDb.addSecret;
            deleteSecret = mockDb.deleteSecret;
        }
    };
});

const mockKms = {
    encrypt: mock(async (plain: string) => `enc-${plain}`),
    decrypt: mock(async (cipher: string) => cipher.replace('enc-', ''))
};

mock.module('@/../../src/security/kms', () => ({
    getKMSProvider: () => mockKms
}));

describe("BYOK API Routes", () => {

    beforeEach(() => {
        mockDb.getPlatformUser.mockClear();
        mockDb.setPlatformUser.mockClear();
        mockDb.getSecrets.mockClear();
        mockDb.addSecret.mockClear();
        mockDb.deleteSecret.mockClear();
        mockKms.encrypt.mockClear();
        mockKms.decrypt.mockClear();
    });

    test("GET /api/keys fetches and decrypts keys", async () => {
        const req = new NextRequest("http://localhost:3000/api/keys");
        const res = await GET(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.keys).toBeArray();
        expect(json.keys.length).toBe(1);
        expect(json.keys[0].name).toBe("my-openai-key");
        expect(json.keys[0].provider).toBe("OpenAI");
        expect(json.keys[0].maskedKey).toBe("sk-...1234");
        expect(mockKms.decrypt).toHaveBeenCalledWith("enc-openai-sk-1234");
    });

    test("POST /api/keys encrypts and adds new key", async () => {
        const req = new NextRequest("http://localhost:3000/api/keys", {
            method: "POST",
            body: JSON.stringify({
                provider: "Gemini",
                key: "gemini-key-9999",
                name: "My Gemini Key",
                expiresAt: "2025-12-31"
            })
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.success).toBe(true);
        expect(json.id).toBe("new-secret-id");

        expect(mockKms.encrypt).toHaveBeenCalledWith("gemini-key-9999");
        expect(mockDb.addSecret).toHaveBeenCalledWith(
            "test-user",
            "My Gemini Key",
            "enc-gemini-key-9999",
            "Gemini",
            "2025-12-31"
        );
    });

    test("POST /api/keys rejects missing provider or key", async () => {
        const req = new NextRequest("http://localhost:3000/api/keys", {
            method: "POST",
            body: JSON.stringify({ provider: "Gemini" }) // Missing key
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error).toBe("Provider and key are required");
    });

    test("DELETE /api/keys deletes key using query param", async () => {
        const req = new NextRequest("http://localhost:3000/api/keys?id=test-secret-id", {
            method: "DELETE"
        });

        const res = await DELETE(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(mockDb.deleteSecret).toHaveBeenCalledWith("test-user", "test-secret-id");
    });

    test("DELETE /api/keys/[id] deletes key using route params", async () => {
        const req = new NextRequest("http://localhost:3000/api/keys/test-secret-id", {
            method: "DELETE"
        });

        // Simulating the dynamic route param
        const res = await routeId.DELETE(req, { params: Promise.resolve({ id: "test-secret-id" }) });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(mockDb.deleteSecret).toHaveBeenCalledWith("test-user", "test-secret-id");
    });
});
