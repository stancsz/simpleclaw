import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';
import { GET, POST } from '../../server/src/app/api/keys/route';
import { DELETE } from '../../server/src/app/api/keys/[id]/route';
import { getDbClient } from '../db/client';
import { getKMSProvider } from './kms';

describe('BYOK API Routes', () => {
    const MOCK_USER_ID = 'test-user';

    // Use an isolated local DB specifically for these tests to avoid table missing errors
    const fs = require('fs');
    const originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "sqlite://local_test_db_keys.sqlite";

    const dbClient = getDbClient();
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    dbClient.applyMigration(schema);

    const kmsProvider = getKMSProvider();

    let keyId = '';

    beforeEach(async () => {
        process.env.KMS_PROVIDER = 'local';
        const mockServiceRole = await kmsProvider.encrypt('mock-service-role-key');
        dbClient.setPlatformUser(MOCK_USER_ID, 'http://localhost:54321', mockServiceRole);

        // clear existing
        const existing = dbClient.getSecrets(MOCK_USER_ID);
        for (const sec of existing) {
            dbClient.deleteSecret(MOCK_USER_ID, sec.id);
        }
    });

    afterAll(() => {
        delete process.env.KMS_PROVIDER;
        try {
            fs.unlinkSync("local_test_db_keys.sqlite");
        } catch(e) {}

        if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
        else delete process.env.DATABASE_URL;
    });

    it('should POST a new key successfully', async () => {
        const reqBody = { provider: 'OpenAI', key: 'sk-12345', name: 'Test Key' };
        const req = {
            json: async () => reqBody
        } as any;

        const res = await POST(req);
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.id).toBeDefined();

        keyId = data.id;
    });

    it('should GET keys successfully and return them masked', async () => {
        // Need to add a key first manually
        const encryptedKey = await kmsProvider.encrypt('sk-54321');
        dbClient.addSecret(MOCK_USER_ID, 'Another Test', encryptedKey, 'OpenAI');

        const req = {} as any;
        const res = await GET(req);
        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.keys).toBeDefined();
        expect(data.keys.length).toBe(1);
        expect(data.keys[0].name).toBe('Another Test');
        expect(data.keys[0].maskedKey).toBe('sk-...4321');
        expect(data.keys[0].provider).toBe('OpenAI');
    });

    it('should DELETE a key successfully', async () => {
        const encryptedKey = await kmsProvider.encrypt('sk-todelete');
        const id = dbClient.addSecret(MOCK_USER_ID, 'Delete Test', encryptedKey, 'OpenAI');

        const req = {
            url: `http://localhost:3000/api/keys/${id}`
        } as any;
        const res = await DELETE(req, { params: Promise.resolve({ id: id as string }) });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);

        const secrets = dbClient.getSecrets(MOCK_USER_ID);
        expect(secrets.length).toBe(0);
    });
});
