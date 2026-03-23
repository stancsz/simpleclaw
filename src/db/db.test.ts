import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { DBClient } from "./client";
import { Database } from "bun:sqlite";
import * as fs from 'fs';
import * as path from 'path';

describe("Database Client Tests (SQLite Local)", () => {
    let dbClient: DBClient;
    const testDbPath = 'test.db';

    beforeAll(() => {
        // Ensure clean slate
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        // Initialize client
        dbClient = new DBClient(`sqlite://${testDbPath}`);

        // Apply migration
        const migrationSql = fs.readFileSync(path.join(__dirname, 'migrations', '001_motherboard.sql'), 'utf-8');
        dbClient.applyMigration(migrationSql);
    });

    afterAll(() => {
        // Cleanup
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    test("Migration applies cleanly and tables exist", () => {
        const rawDb = new Database(testDbPath);

        const tablesQuery = rawDb.query("SELECT name FROM sqlite_master WHERE type='table'").all() as {name: string}[];
        const tables = tablesQuery.map(t => t.name);

        expect(tables).toContain('vault_user_secrets');
        expect(tables).toContain('orchestrator_sessions');
        expect(tables).toContain('task_results');
        expect(tables).toContain('audit_log');
        expect(tables).toContain('transaction_log');
        expect(tables).toContain('heartbeat_queue');
        expect(tables).toContain('gas_ledger');
        expect(tables).toContain('skill_refs');

        rawDb.close();
    });

    test("Session CRUD operations", () => {
        const userId = "test_user_123";
        const context = { prompt: "test prompt" };
        const manifest = { steps: [] };

        // Create
        const sessionId = dbClient.createSession(userId, context, manifest);
        expect(sessionId).toBeDefined();

        // Retrieve
        const session = dbClient.getSession(sessionId);
        expect(session).not.toBeNull();
        expect(session.user_id).toBe(userId);
        expect(session.status).toBe('active');
        expect(session.context.prompt).toBe("test prompt");

        // Audit log should have recorded 'intent_received'
        const rawDb = new Database(testDbPath);
        const auditLog = rawDb.query(`SELECT * FROM audit_log WHERE session_id = ? AND event = 'intent_received'`).get(sessionId);
        expect(auditLog).not.toBeNull();

        // Update
        dbClient.updateSessionStatus(sessionId, 'approved');

        const updatedSession = dbClient.getSession(sessionId);
        expect(updatedSession.status).toBe('approved');

        // Audit log should have recorded 'plan_approved'
        const auditLogApproved = rawDb.query(`SELECT * FROM audit_log WHERE session_id = ? AND event = 'plan_approved'`).get(sessionId);
        expect(auditLogApproved).not.toBeNull();

        rawDb.close();
    });

    test("Idempotency guard", () => {
        const idempotencyKey = "test_tx_key_1";

        // Initially should not exist
        expect(dbClient.checkIdempotency(idempotencyKey)).toBe(false);

        // Log transaction
        dbClient.logTransaction(idempotencyKey, 'completed', { some: "result" });

        // Now it should exist
        expect(dbClient.checkIdempotency(idempotencyKey)).toBe(true);

        // Trying to log it again shouldn't fail (upsert)
        dbClient.logTransaction(idempotencyKey, 'completed', { some: "result" });
        expect(dbClient.checkIdempotency(idempotencyKey)).toBe(true);

        // Log a pending one
        const key2 = "test_tx_key_2";
        dbClient.logTransaction(key2, 'pending', {});

        // checkIdempotency only returns true for 'completed'
        expect(dbClient.checkIdempotency(key2)).toBe(false);
    });

    test("Audit log writes on state transitions", () => {
        const sessionId = "session_for_audit_test";

        dbClient.writeAuditLog(sessionId, 'test_event', { key: 'value' });

        const rawDb = new Database(testDbPath);
        const logEntry = rawDb.query(`SELECT * FROM audit_log WHERE session_id = ? AND event = ?`).get(sessionId, 'test_event') as any;

        expect(logEntry).not.toBeNull();
        expect(JSON.parse(logEntry.metadata).key).toBe('value');

        rawDb.close();
    });

    test("simulateReadSecret simulation", () => {
        const rawDb = new Database(testDbPath);

        // Seed a secret
        const secretId = crypto.randomUUID();
        rawDb.run(
            `INSERT INTO vault_user_secrets (id, user_id, name, secret, provider) VALUES (?, ?, ?, ?, ?)`,
            [secretId, "test-user-id", "test_key", "secret_value_123", "openai"]
        );
        rawDb.close();

        const secret = dbClient.simulateReadSecret(secretId);
        expect(secret).toBe("secret_value_123");

        // Non-existent secret
        const missingSecret = dbClient.simulateReadSecret("missing_id");
        expect(missingSecret).toBeNull();
    });
});

describe("Database Client Tests (Supabase Mock)", () => {
    let originalEnvUrl: string | undefined;
    let originalEnvKey: string | undefined;

    beforeAll(() => {
        originalEnvUrl = process.env.SUPABASE_URL;
        originalEnvKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        process.env.SUPABASE_URL = "https://mock.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "mock_key";
    });

    afterAll(() => {
        if (originalEnvUrl) process.env.SUPABASE_URL = originalEnvUrl;
        else delete process.env.SUPABASE_URL;

        if (originalEnvKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnvKey;
        else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    });

    test("Initializes in Supabase mode based on environment variables", () => {
        const client = new DBClient();
        expect(client.isSupabase).toBe(true);
    });

    test("Health check retry logic returns true when successful", async () => {
        const client = new DBClient();
        // Since we don't have a real Supabase instance, we're mocking the internal supabase object
        const mockSupabase = {
            from: () => ({
                select: () => ({
                    limit: () => Promise.resolve({ error: { code: '42P01' } }) // simulates missing table, which is considered healthy
                })
            })
        };
        (client as any).supabase = mockSupabase;

        const isHealthy = await client.checkSupabaseHealth(3, 10);
        expect(isHealthy).toBe(true);
    });

    test("Health check retry logic returns false when failed", async () => {
        const client = new DBClient();
        const mockSupabase = {
            from: () => ({
                select: () => ({
                    limit: () => Promise.reject(new Error("Network Error")) // simulates connection failure
                })
            })
        };
        (client as any).supabase = mockSupabase;

        const isHealthy = await client.checkSupabaseHealth(2, 10);
        expect(isHealthy).toBe(false);
    });
});
