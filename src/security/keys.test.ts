import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { getDbClient } from '../db/client';
import { getKMSProvider } from './kms';

describe('BYOK API Flow (Local DB Simulation)', () => {
    const MOCK_USER_ID = 'test-user';
    const dbClient = getDbClient();
    const kmsProvider = getKMSProvider();

    beforeEach(async () => {
        process.env.KMS_PROVIDER = 'local';
        // Mock DB is persistent across tests in bun:sqlite depending on how it's initialized,
        // so we can set up the platform user here.
        const mockServiceRole = await kmsProvider.encrypt('mock-service-role-key');
        dbClient.setPlatformUser(MOCK_USER_ID, 'http://localhost:54321', mockServiceRole);

        // Delete any existing secrets to start fresh
        const existing = dbClient.getSecrets(MOCK_USER_ID);
        for (const sec of existing) {
            dbClient.deleteSecret(MOCK_USER_ID, sec.id);
        }
    });

    afterAll(() => {
        delete process.env.KMS_PROVIDER;
    });

    it('should add an encrypted key and retrieve it masked', async () => {
        const testKey = 'sk-proj-super-secret-1234';
        const encryptedKey = await kmsProvider.encrypt(testKey);

        const secretId = dbClient.addSecret(MOCK_USER_ID, 'Test OpenAI', encryptedKey, 'OpenAI');
        expect(secretId).not.toBeNull();

        const secrets = dbClient.getSecrets(MOCK_USER_ID);
        expect(secrets.length).toBe(1);

        const storedSecret = secrets[0];
        expect(storedSecret.name).toBe('Test OpenAI');
        expect(storedSecret.provider).toBe('OpenAI');

        // Ensure what is stored is the encrypted version
        expect(storedSecret.secret).toBe(encryptedKey);
        expect(storedSecret.secret).not.toBe(testKey);

        // Simulate API route decryption
        const decryptedKey = await kmsProvider.decrypt(storedSecret.secret);
        expect(decryptedKey).toBe(testKey);

        const maskedKey = `sk-...${decryptedKey.substring(decryptedKey.length - 4)}`;
        expect(maskedKey).toBe('sk-...1234');
    });

    it('should delete a key', async () => {
        const testKey = 'sk-proj-another-key-9876';
        const encryptedKey = await kmsProvider.encrypt(testKey);

        const secretId = dbClient.addSecret(MOCK_USER_ID, 'Test DeepSeek', encryptedKey, 'DeepSeek');
        expect(secretId).not.toBeNull();

        let secrets = dbClient.getSecrets(MOCK_USER_ID);
        expect(secrets.length).toBe(1);

        dbClient.deleteSecret(MOCK_USER_ID, secretId);

        secrets = dbClient.getSecrets(MOCK_USER_ID);
        expect(secrets.length).toBe(0);
    });
});
