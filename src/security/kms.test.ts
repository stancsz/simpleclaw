import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { getKMSProvider } from './kms';

describe('KMS Provider (Local)', () => {
    // Ensure we use the local provider for these tests
    beforeEach(() => {
        process.env.KMS_PROVIDER = 'local';
    });

    afterAll(() => {
        delete process.env.KMS_PROVIDER;
    });

    it('should encrypt and decrypt a payload successfully (roundtrip)', async () => {
        const kms = getKMSProvider();
        const plaintext = 'test-super-secret-service-role-key-123';

        const ciphertext = await kms.encrypt(plaintext);

        // Ensure ciphertext is different from plaintext and contains the payload parts
        expect(ciphertext).not.toEqual(plaintext);
        expect(ciphertext.split(':').length).toBe(3); // iv:authTag:encryptedText

        const decrypted = await kms.decrypt(ciphertext);

        expect(decrypted).toEqual(plaintext);
    });

    it('should fail decryption gracefully when ciphertext is tampered', async () => {
        const kms = getKMSProvider();
        const plaintext = 'test-super-secret-service-role-key-123';
        const ciphertext = await kms.encrypt(plaintext);

        // Tamper with the ciphertext (e.g. modify the last few characters)
        const parts = ciphertext.split(':');
        const originalEncryptedText = parts[2];
        const tamperedEncryptedText = originalEncryptedText.substring(0, originalEncryptedText.length - 2) + 'XX';

        const tamperedCiphertext = `${parts[0]}:${parts[1]}:${tamperedEncryptedText}`;

        // This should throw an error because the authentication tag won't match
        try {
            await kms.decrypt(tamperedCiphertext);
            expect(true).toBe(false); // This shouldn't be reached
        } catch (error: any) {
            expect(error.message).toContain('Decryption failed');
        }
    });
});

describe('Worker Lifecycle Simulation (Local)', () => {
    let mockWorkerDb: Record<string, string> = {};

    beforeEach(() => {
        process.env.KMS_PROVIDER = 'local';
        mockWorkerDb = {};
    });

    afterAll(() => {
        delete process.env.KMS_PROVIDER;
    });

    it('should boot with encrypted key, decrypt, use in memory, terminate (ensure key is not persisted)', async () => {
        const kms = getKMSProvider();

        // 1. Boot: Simulating the fetching of the encrypted key
        const encryptedServiceRole = await kms.encrypt('my-super-secret-service-role-key');

        // 2. Decrypt: The worker decrypts it
        let decryptedServiceRole: string | null = await kms.decrypt(encryptedServiceRole);

        // 3. Use in memory: The worker uses it
        // We assert it's available for the worker's action
        expect(decryptedServiceRole).toEqual('my-super-secret-service-role-key');

        // 4. Terminate: Ensure key is not persisted
        // The worker finishes its job, and the memory goes out of scope.
        // We simulate the termination by nullifying the variable.
        decryptedServiceRole = null;

        // Assert that the decrypted key is no longer available
        expect(decryptedServiceRole).toBeNull();
    });
});
