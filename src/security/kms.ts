import * as crypto from 'crypto';

// The interface for KMS provider
export interface KMSProvider {
    encrypt(plaintext: string): Promise<string>;
    decrypt(ciphertext: string): Promise<string>;
}

class LocalKMSProvider implements KMSProvider {
    // We use a static key for local development to simulate a persistent KMS key.
    // In a real app, this should be an environment variable.
    private readonly key: Buffer;

    constructor() {
        // Generate a deterministic 32-byte key for consistent local testing
        // or fall back to an environment variable if provided.
        const keyMaterial = process.env.LOCAL_KMS_KEY || 'local-development-kms-key-32-byte-secret-padding-xxx';
        this.key = crypto.createHash('sha256').update(keyMaterial).digest();
    }

    async encrypt(plaintext: string): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                // Generate a random 12-byte initialization vector (IV) for GCM
                const iv = crypto.randomBytes(12);

                const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);

                let encrypted = cipher.update(plaintext, 'utf8', 'base64');
                encrypted += cipher.final('base64');

                // Get the 16-byte authentication tag
                const authTag = cipher.getAuthTag();

                // Construct the final payload: iv:authTag:ciphertext
                const payload = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;

                resolve(payload);
            } catch (error) {
                reject(error);
            }
        });
    }

    async decrypt(ciphertext: string): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                // Parse the payload
                const parts = ciphertext.split(':');
                if (parts.length !== 3) {
                    throw new Error('Invalid ciphertext format');
                }

                const iv = Buffer.from(parts[0], 'base64');
                const authTag = Buffer.from(parts[1], 'base64');
                const encryptedText = parts[2];

                const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
                decipher.setAuthTag(authTag);

                let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
                decrypted += decipher.final('utf8');

                resolve(decrypted);
            } catch (error) {
                reject(new Error('Decryption failed: tampered or invalid ciphertext'));
            }
        });
    }
}

class GCPKMSProvider implements KMSProvider {
    async encrypt(plaintext: string): Promise<string> {
        // TODO: Implement actual @google-cloud/kms integration
        throw new Error('GCP KMS provider not yet implemented');
    }

    async decrypt(ciphertext: string): Promise<string> {
        // TODO: Implement actual @google-cloud/kms integration
        throw new Error('GCP KMS provider not yet implemented');
    }
}

// Factory function to get the appropriate KMS provider
export function getKMSProvider(): KMSProvider {
    const provider = process.env.KMS_PROVIDER || 'local';

    if (provider === 'gcp') {
        return new GCPKMSProvider();
    } else {
        return new LocalKMSProvider();
    }
}
