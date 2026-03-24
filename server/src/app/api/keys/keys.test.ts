import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { GET, POST } from './route';
import { DELETE, PATCH } from './[id]/route';
import { NextRequest } from 'next/server';
import { getDbClient } from '@/../../src/db/client';
import { getKMSProvider } from '@/../../src/security/kms';
import fs from 'fs';
import path from 'path';

describe('BYOK API Routes', () => {
    const MOCK_USER_ID = 'test-user';
    const originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "sqlite://local_test_db_api_keys.sqlite";

    const dbClient = getDbClient();
    const schemaPath = path.resolve(process.cwd(), process.cwd().includes('server') ? "../src/db/migrations/001_motherboard.sql" : "src/db/migrations/001_motherboard.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");
    dbClient.applyMigration(schema);
    const kmsProvider = getKMSProvider();

    beforeEach(async () => {
        process.env.KMS_PROVIDER = 'local';
        // Setup platform user
        const mockServiceRole = await kmsProvider.encrypt('mock-service-role-key');
        dbClient.setPlatformUser(MOCK_USER_ID, 'http://localhost:54321', mockServiceRole);

        // Delete any existing secrets
        const existing = dbClient.getSecrets(MOCK_USER_ID);
        for (const sec of existing) {
            dbClient.deleteSecret(MOCK_USER_ID, sec.id);
        }
    });

    afterAll(() => {
        delete process.env.KMS_PROVIDER;
        try {
            fs.unlinkSync("local_test_db_api_keys.sqlite");
        } catch(e) {}

        if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
        else delete process.env.DATABASE_URL;
    });

    it('should create a new key via POST', async () => {
        const req = new NextRequest('http://localhost/api/keys', {
            method: 'POST',
            body: JSON.stringify({
                provider: 'OpenAI',
                key: 'sk-proj-test-key-1234',
                name: 'Test Project Key',
                expiresAt: '2027-01-01'
            })
        });

        const response = await POST(req);
        expect(response.status).toBe(201);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.id).toBeDefined();

        // Verify it was stored encrypted
        const secrets = dbClient.getSecrets(MOCK_USER_ID);
        expect(secrets.length).toBe(1);
        expect(secrets[0].provider).toBe('OpenAI');
        expect(secrets[0].name).toBe('Test Project Key');

        // Decrypt to verify it matches
        const decryptedKey = await kmsProvider.decrypt(secrets[0].secret);
        expect(decryptedKey).toBe('sk-proj-test-key-1234');
    });

    it('should retrieve keys masked via GET', async () => {
        // Pre-insert a key directly
        const testKey = 'sk-proj-retrieval-test-5678';
        const encryptedKey = await kmsProvider.encrypt(testKey);
        dbClient.addSecret(MOCK_USER_ID, 'Retrieval Test Key', encryptedKey, 'Gemini');

        const req = new NextRequest('http://localhost/api/keys');
        const response = await GET(req);

        expect(response.status).toBe(200);
        const data = await response.json();

        expect(data.keys).toBeDefined();
        expect(data.keys.length).toBe(1);

        const key = data.keys[0];
        expect(key.provider).toBe('Gemini');
        expect(key.name).toBe('Retrieval Test Key');
        expect(key.maskedKey).toBe('sk-...5678');
    });

    it('should delete a key via DELETE', async () => {
         // Pre-insert a key directly
         const testKey = 'sk-proj-delete-test-9999';
         const encryptedKey = await kmsProvider.encrypt(testKey);
         const secretId = dbClient.addSecret(MOCK_USER_ID, 'Delete Test Key', encryptedKey, 'DeepSeek');

         // Mock the NextRequest
         const req = new NextRequest(`http://localhost/api/keys/${secretId}?id=${secretId}`);

         const response = await DELETE(req, { params: Promise.resolve({ id: secretId! }) });
         expect(response.status).toBe(200);

         const data = await response.json();
         expect(data.success).toBe(true);

         // Verify it's gone
         const secrets = dbClient.getSecrets(MOCK_USER_ID);
         expect(secrets.length).toBe(0);
    });

    it('should handle POST missing required fields', async () => {
        const req = new NextRequest('http://localhost/api/keys', {
            method: 'POST',
            body: JSON.stringify({
                provider: 'OpenAI'
                // missing key
            })
        });

        const response = await POST(req);
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error).toBe("Provider and key are required");
    });

    it('should update a key via PATCH', async () => {
        // Pre-insert a key directly
        const testKey = 'sk-proj-update-test-1111';
        const encryptedKey = await kmsProvider.encrypt(testKey);
        const secretId = dbClient.addSecret(MOCK_USER_ID, 'Update Test Key', encryptedKey, 'OpenAI');

        const newName = 'Updated Test Key Name';
        const newKey = 'sk-proj-updated-key-2222';
        const newExpiresAt = '2028-01-01';

        const req = new NextRequest(`http://localhost/api/keys/${secretId}?id=${secretId}`, {
            method: 'PATCH',
            body: JSON.stringify({
                name: newName,
                key: newKey,
                expiresAt: newExpiresAt
            })
        });

        const response = await PATCH(req, { params: Promise.resolve({ id: secretId! }) });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);

        // Verify it was updated
        const secrets = dbClient.getSecrets(MOCK_USER_ID);
        expect(secrets.length).toBe(1);
        expect(secrets[0].name).toBe(newName);
        expect(secrets[0].expiresAt).toBe(newExpiresAt);

        // Decrypt to verify key was updated
        const updatedDecryptedKey = await kmsProvider.decrypt(secrets[0].secret);
        expect(updatedDecryptedKey).toBe(newKey);
    });
});
