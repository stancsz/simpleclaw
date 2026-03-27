import { getDbClient } from "@/../../src/db/client";
import { getKMSProvider } from "@/../../src/security/kms";
import { createClient } from "@supabase/supabase-js";

const MOCK_USER_ID = 'test-user'; // Minimal auth for Phase 0 / Phase 1 local development

// Helper to get authenticated Supabase client for a user using KMS decrypted credentials
async function getUserSupabaseClient() {
    const dbClient = getDbClient();
    const kmsProvider = getKMSProvider();

    let platformUser = dbClient.getPlatformUser(MOCK_USER_ID);
    if (!platformUser) {
        // Fallback or auto-create for local mock
        const mockServiceRole = await kmsProvider.encrypt('mock-service-role-key');
        dbClient.setPlatformUser(MOCK_USER_ID, 'http://localhost:54321', mockServiceRole);
        platformUser = dbClient.getPlatformUser(MOCK_USER_ID);
    }

    if (!platformUser || !platformUser.supabase_url || !platformUser.encrypted_service_role) {
        throw new Error("User platform credentials not found.");
    }

    const decryptedServiceRole = await kmsProvider.decrypt(platformUser.encrypted_service_role);

    // Instantiate Supabase client with decrypted user credentials
    return createClient(platformUser.supabase_url, decryptedServiceRole);
}

export async function getKeys() {
    const kmsProvider = getKMSProvider();

    // In test environment, if Supabase Vault isn't actually reachable, we gracefully fallback to the local DB stub
    let supabase;
    try {
        supabase = await getUserSupabaseClient();
    } catch (e) {
        console.error("Failed to initialize Supabase client:", e);
        return [];
    }

    // Try fetching from real Supabase Vault
    try {
        const { data: rawSecrets, error } = await supabase
            .from('vault.user_secrets')
            .select('*')
            .eq('user_id', MOCK_USER_ID);

        if (error) throw new Error(error.message);

        if (!rawSecrets || rawSecrets.length === 0) {
            // Fallback for mock db testing environments
            const dbClient = getDbClient();
            const fallbackSecrets = dbClient.getSecrets(MOCK_USER_ID);
            return await Promise.all(fallbackSecrets.map(async (secretObj) => {
                 const decryptedKey = await kmsProvider.decrypt(secretObj.secret);
                 const maskLength = Math.max(0, decryptedKey.length - 4);
                 const maskedKey = maskLength > 0 ? `sk-...${decryptedKey.substring(decryptedKey.length - 4)}` : 'sk-...';
                 return { ...secretObj, maskedKey };
            }));
        }

        const keys = await Promise.all(rawSecrets.map(async (secretObj: any) => {
            try {
                // If Vault encrypts at rest (pgsodium), 'secret' might already be decrypted by the View
                // Or if we double-encrypt via KMS, we decrypt it here.
                const decryptedKey = await kmsProvider.decrypt(secretObj.secret);
                const maskLength = Math.max(0, decryptedKey.length - 4);
                const maskedKey = maskLength > 0 ? `sk-...${decryptedKey.substring(decryptedKey.length - 4)}` : 'sk-...';

                return {
                    id: secretObj.id,
                    name: secretObj.name,
                    provider: secretObj.provider,
                    expiresAt: secretObj.expires_at,
                    maskedKey: maskedKey,
                    createdAt: secretObj.created_at
                };
            } catch (err) {
                return {
                    id: secretObj.id,
                    name: secretObj.name,
                    provider: secretObj.provider,
                    expiresAt: secretObj.expires_at,
                    maskedKey: 'sk-...error',
                    createdAt: secretObj.created_at
                };
            }
        }));
        return keys;
    } catch (e) {
        console.warn("Real Supabase Vault fetch failed. Using fallback.", e);
        const dbClient = getDbClient();
        const fallbackSecrets = dbClient.getSecrets(MOCK_USER_ID);
        return await Promise.all(fallbackSecrets.map(async (secretObj) => {
             const decryptedKey = await kmsProvider.decrypt(secretObj.secret);
             const maskLength = Math.max(0, decryptedKey.length - 4);
             const maskedKey = maskLength > 0 ? `sk-...${decryptedKey.substring(decryptedKey.length - 4)}` : 'sk-...';
             return { ...secretObj, maskedKey };
        }));
    }
}

export async function addKey(provider: string, key: string, name: string, expiresAt: string | null) {
    if (!provider || !key) {
        throw new Error("Provider and key are required");
    }

    const kmsProvider = getKMSProvider();
    const encryptedKey = await kmsProvider.encrypt(key);
    const secretName = name || `${provider}-key`;

    let supabase;
    try {
        supabase = await getUserSupabaseClient();
        const id = crypto.randomUUID();
        const { error } = await supabase
            .from('vault.user_secrets')
            .insert({
                id,
                user_id: MOCK_USER_ID,
                name: secretName,
                secret: encryptedKey,
                provider: provider,
                expires_at: expiresAt || null
            });

        if (error) throw new Error(error.message);
        return id;
    } catch (e: any) {
        console.warn("Real Supabase Vault insert failed. Using fallback.", e);
        // Fallback for tests
        const dbClient = getDbClient();
        return dbClient.addSecret(MOCK_USER_ID, secretName, encryptedKey, provider, expiresAt);
    }
}

export async function deleteKey(secretId: string) {
    if (!secretId) {
        throw new Error("Secret ID is required");
    }

    let supabase;
    try {
        supabase = await getUserSupabaseClient();
        const { error } = await supabase
            .from('vault.user_secrets')
            .delete()
            .eq('id', secretId)
            .eq('user_id', MOCK_USER_ID);

        if (error) throw new Error(error.message);
    } catch (e) {
        console.warn("Real Supabase Vault delete failed. Using fallback.", e);
        const dbClient = getDbClient();
        dbClient.deleteSecret(MOCK_USER_ID, secretId);
    }
}

export async function updateKey(secretId: string, name?: string, key?: string, expiresAt?: string | null) {
    if (!secretId) {
        throw new Error("Secret ID is required");
    }

    const kmsProvider = getKMSProvider();
    let encryptedKey: string | undefined = undefined;
    if (key !== undefined) {
        encryptedKey = await kmsProvider.encrypt(key);
    }

    let supabase;
    try {
        supabase = await getUserSupabaseClient();
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (encryptedKey !== undefined) updates.secret = encryptedKey;
        if (expiresAt !== undefined) updates.expires_at = expiresAt;

        const { error } = await supabase
            .from('vault.user_secrets')
            .update(updates)
            .eq('id', secretId)
            .eq('user_id', MOCK_USER_ID);

        if (error) throw new Error(error.message);
    } catch (e) {
        console.warn("Real Supabase Vault update failed. Using fallback.", e);
        const dbClient = getDbClient();
        dbClient.updateSecret(MOCK_USER_ID, secretId, name, encryptedKey, expiresAt);
    }
}
