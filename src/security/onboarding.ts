import { getKMSProvider } from './kms';
import { getDbClient } from '../db/client';

export interface PlatformUser {
    userId: string;
    supabaseUrl: string;
    encryptedServiceRole: string;
}

export async function onboardUserKey(userId: string, supabaseUrl: string, serviceRoleKey: string): Promise<PlatformUser> {
    const kmsProvider = getKMSProvider();

    // Encrypt the service role key using KMS
    const encryptedServiceRole = await kmsProvider.encrypt(serviceRoleKey);

    // Store it in the local database (simulating the platform DB)
    const dbClient = getDbClient();
    dbClient.setPlatformUser(userId, supabaseUrl, encryptedServiceRole);

    // Return the created record (mainly for testing)
    return {
        userId,
        supabaseUrl,
        encryptedServiceRole
    };
}
