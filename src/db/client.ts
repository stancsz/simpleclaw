// Use dynamic import or fallback type since we can't use bun:sqlite in Next.js edge/node runtime directly
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class DBClient {
  private db: any | null = null;
  private supabase: SupabaseClient | null = null;
  public isSupabase = false;
  private supabaseHealthy = false;

  constructor(databaseUrl: string = process.env.DATABASE_URL || 'sqlite://local.db') {
    if (databaseUrl.startsWith('supabase://') || process.env.SUPABASE_URL) {
      this.isSupabase = true;
      const url = process.env.SUPABASE_URL || databaseUrl.replace('supabase://', 'https://');
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key';
      this.supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      // Will be set by health check
      this.supabaseHealthy = true;
    } else {
      const dbPath = databaseUrl.replace('sqlite://', '');
      try {
        if (typeof process !== "undefined" && process.versions && process.versions.bun) {
           const { Database } = require('bun' + ':sqlite');
           this.db = new Database(dbPath, { create: true });
        } else {
           console.warn("Running outside of bun, DBClient is mostly a stub.");
           this.db = {
               run: () => {},
               query: () => ({ get: () => null, all: () => [] }),
               transaction: (cb: any) => cb
           };
        }
      } catch (e) {
         console.warn("bun:sqlite not available. DBClient operates as a stub.");
      }
    }
  }

  async checkSupabaseHealth(retries = 3, delay = 1000): Promise<boolean> {
    if (!this.isSupabase || !this.supabase) return true;
    for (let i = 0; i < retries; i++) {
      try {
        const { error } = await this.supabase.from('orchestrator_sessions').select('id').limit(1);
        if (!error || error.code === '42P01') { // 42P01 is expected if tables are not created yet
          this.supabaseHealthy = true;
          return true;
        }
      } catch (err) {
        // Continue to retry
      }
      await new Promise(res => setTimeout(res, delay));
    }
    this.supabaseHealthy = false;
    return false;
  }

  applyMigration(sql: string) {
    if (this.isSupabase) {
      console.warn("Migrations should be applied using the migration script.");
      return;
    }
    if (this.db) {
        // SQLite doesn't do multiple statements natively well in bun without `run`, so we split by ';'
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        this.db.transaction(() => {
           for (const stmt of statements) {
               this.db!.run(stmt);
           }
        })();
    }
  }

  createSession(userId: string, context: any, manifest: any): string {
    const sessionId = crypto.randomUUID();
    if (this.isSupabase && this.supabase) {
      // Async operation wrapped in fire-and-forget or handled properly depending on usage.
      // Since createSession in orchestrator is synchronous and returns ID immediately, we do async DB write:
      this.supabase.from('orchestrator_sessions').insert({
        id: sessionId,
        user_id: userId,
        context: context,
        manifest: manifest,
        status: 'active'
      }).then(({ error }) => {
        if (error) console.error("Error creating session in Supabase:", error);
      });
      this.writeAuditLog(sessionId, 'intent_received', { status: 'active' });
      return sessionId;
    }

    if (this.db) {
      this.db.run(
        `INSERT INTO orchestrator_sessions (id, user_id, context, manifest, status) VALUES (?, ?, ?, ?, 'active')`,
        [sessionId, userId, JSON.stringify(context), JSON.stringify(manifest)]
      );
      this.writeAuditLog(sessionId, 'intent_received', { status: 'active' });
    }
    return sessionId;
  }

  updateSessionStatus(sessionId: string, status: string) {
     let eventName = 'session_updated';
     if (status === 'approved') eventName = 'plan_approved';
     else if (status === 'executing') eventName = 'execution_started';
     else if (status === 'completed') eventName = 'execution_completed';
     else if (status === 'error') eventName = 'execution_failed';

     if (this.isSupabase && this.supabase) {
        this.supabase.from('orchestrator_sessions').update({
          status,
          updated_at: new Date().toISOString()
        }).eq('id', sessionId).then(({ error }) => {
          if (error) console.error("Error updating session in Supabase:", error);
        });
        this.writeAuditLog(sessionId, eventName, { status });
        return;
     }
     if (this.db) {
        this.db.run(
          `UPDATE orchestrator_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [status, sessionId]
        );

        let eventName = 'session_updated';
        if (status === 'approved') eventName = 'plan_approved';
        else if (status === 'executing') eventName = 'execution_started';
        else if (status === 'completed') eventName = 'execution_completed';
        else if (status === 'error') eventName = 'execution_failed';

        this.writeAuditLog(sessionId, eventName, { status });
     }
  }

  async getTaskResultsAsync(sessionId: string): Promise<any[]> {
    if (this.isSupabase && this.supabase) {
      const { data, error } = await this.supabase
        .from('task_results')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      if (error) console.error("Error fetching task results:", error);
      return data || [];
    }
    return this.getTaskResults(sessionId);
  }

  getTaskResults(sessionId: string): any[] {
    if (this.isSupabase) {
      // Synchronous fallback (ideally callers should use async version)
      console.warn("getTaskResults called synchronously in Supabase mode - returning empty. Callers should be async.");
      return [];
    }
    if (this.db) {
        return this.db.query(`SELECT * FROM task_results WHERE session_id = ? ORDER BY created_at ASC`).all(sessionId) as any[];
    }
    return [];
  }

  async getSessionAsync(sessionId: string): Promise<any> {
    if (this.isSupabase && this.supabase) {
        const { data, error } = await this.supabase
          .from('orchestrator_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();
        if (error) console.error("Error fetching session:", error);
        return data || null;
    }
    return this.getSession(sessionId);
  }

  getSession(sessionId: string): any {
    if (this.isSupabase) {
        console.warn("getSession called synchronously in Supabase mode. Callers should be async.");
        return null;
    }
    if (this.db) {
        const row = this.db.query(`SELECT * FROM orchestrator_sessions WHERE id = ?`).get(sessionId) as any;
        if (row) {
             row.context = JSON.parse(row.context);
             row.manifest = JSON.parse(row.manifest);
        }
        return row;
    }
    return null;
  }

  async checkIdempotencyAsync(key: string): Promise<boolean> {
    if (this.isSupabase && this.supabase) {
        const { data, error } = await this.supabase
          .from('transaction_log')
          .select('idempotency_key')
          .eq('idempotency_key', key)
          .eq('status', 'completed')
          .single();
        return !!data;
    }
    return this.checkIdempotency(key);
  }

  checkIdempotency(key: string): boolean {
    if (this.isSupabase) {
        return false;
    }
    if (this.db) {
        const row = this.db.query(`SELECT * FROM transaction_log WHERE idempotency_key = ? AND status = 'completed'`).get(key);
        return !!row;
    }
    return false;
  }

  async logTransactionAsync(key: string, status: string, result: any) {
    if (this.isSupabase && this.supabase) {
        await this.supabase.from('transaction_log').upsert({
            idempotency_key: key,
            status: status,
            result: result
        });
        return;
    }
    this.logTransaction(key, status, result);
  }

  logTransaction(key: string, status: string, result: any) {
    if (this.isSupabase && this.supabase) {
        this.supabase.from('transaction_log').upsert({
            idempotency_key: key,
            status: status,
            result: result
        }).then();
        return;
    }
    if (this.db) {
        this.db.run(
            `INSERT INTO transaction_log (idempotency_key, status, result) VALUES (?, ?, ?)
             ON CONFLICT(idempotency_key) DO UPDATE SET status = excluded.status, result = excluded.result`,
            [key, status, JSON.stringify(result)]
        );
    }
  }

  createTransactionLogEntry(idempotency_key: string, status: string, result: any) {
    return this.logTransaction(idempotency_key, status, result);
  }

  logTaskResult(sessionId: string, workerId: string, skillRef: string, status: string, outputOrError: any, isError: boolean = false) {
    if (this.isSupabase && this.supabase) {
      const payload: any = {
          session_id: sessionId,
          worker_id: workerId,
          skill_ref: skillRef,
          status: status
      };
      if (isError) {
          payload.error = String(outputOrError);
      } else {
          payload.output = outputOrError;
      }
      this.supabase.from('task_results').insert(payload).then(({ error }) => {
          if (error) console.error("Error logging task result:", error);
      });
      return;
    }
    if (this.db) {
      if (isError) {
        this.db.run(
          `INSERT INTO task_results (session_id, worker_id, skill_ref, status, error) VALUES (?, ?, ?, ?, ?)`,
          [sessionId, workerId, skillRef, status, String(outputOrError)]
        );
      } else {
        this.db.run(
          `INSERT INTO task_results (session_id, worker_id, skill_ref, status, output) VALUES (?, ?, ?, ?, ?)`,
          [sessionId, workerId, skillRef, status, JSON.stringify(outputOrError)]
        );
      }
    }
  }

  writeAuditLog(sessionId: string, event: string, metadata: any) {
    if (this.isSupabase && this.supabase) {
        this.supabase.from('audit_log').insert({
            session_id: sessionId || null, // handle empty sessionId for secret access
            event: event,
            metadata: metadata
        }).then(({ error }) => {
            if (error) console.error("Error writing audit log:", error);
        });
        return;
    }
    if (this.db) {
        const id = crypto.randomUUID();
        this.db.run(
            `INSERT INTO audit_log (id, session_id, event, metadata) VALUES (?, ?, ?, ?)`,
            [id, sessionId, event, JSON.stringify(metadata)]
        );
    }
  }

  async getAuditLogsAsync(sessionId: string): Promise<any[]> {
    if (this.isSupabase && this.supabase) {
        const { data, error } = await this.supabase
          .from('audit_log')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true });
        return data || [];
    }
    return this.getAuditLogs(sessionId);
  }

  getAuditLogs(sessionId: string): any[] {
    if (this.isSupabase) return [];
    if (this.db) {
        return this.db.query(`SELECT * FROM audit_log WHERE session_id = ? ORDER BY created_at ASC`).all(sessionId) as any[];
    }
    return [];
  }

  async readSecretAsync(secretId: string): Promise<string | null> {
    if (this.isSupabase && this.supabase) {
        // Use RPC to read secret
        const { data, error } = await this.supabase.rpc('read_secret', { p_secret_id: secretId });
        if (error) {
            console.error("Error reading secret via RPC:", error);
            return null;
        }
        return data;
    }
    return this.simulateReadSecret(secretId);
  }

  simulateReadSecret(secretId: string): string | null {
    if (this.isSupabase) {
        console.warn("simulateReadSecret called in Supabase mode synchronously. Call readSecretAsync instead.");
        return "MOCK_SUPABASE_SECRET";
    }

    if (this.db) {
        const row = this.db.query(`SELECT secret FROM vault_user_secrets WHERE id = ?`).get(secretId) as any;

        // Log access simulation
        this.writeAuditLog('', 'secret_accessed', { secret_id: secretId });

        return row ? row.secret : null;
    }
    return null;
  }

  async addSecretAsync(userId: string, name: string, secret: string, provider: string, expiresAt?: string | null): Promise<string | null> {
    if (this.isSupabase && this.supabase) {
        const { data, error } = await this.supabase.from('vault_user_secrets').insert({ // using vault_user_secrets proxy table or actual table
            user_id: userId,
            name: name,
            secret: secret, // in real supabase this would be encrypted by an RPC or DB trigger
            provider: provider,
            expires_at: expiresAt || null
        }).select('id').single();
        if (error) {
            console.error("Error adding secret:", error);
            return null;
        }
        return data?.id || null;
    }
    return this.addSecret(userId, name, secret, provider, expiresAt);
  }

  addSecret(userId: string, name: string, secret: string, provider: string, expiresAt?: string | null) {
    if (this.isSupabase) {
        console.warn("addSecret called synchronously in Supabase mode.");
        return null;
    }
    if (this.db) {
        const id = crypto.randomUUID();
        this.db.run(
            `INSERT INTO vault_user_secrets (id, user_id, name, secret, provider, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, userId, name, secret, provider, expiresAt || null]
        );
        return id;
    }
    return null;
  }

  async getSecretsAsync(userId: string): Promise<any[]> {
    if (this.isSupabase && this.supabase) {
        const { data, error } = await this.supabase
          .from('vault_user_secrets')
          .select('id, name, provider, expires_at, created_at')
          .eq('user_id', userId);
        if (error) {
            console.error("Error getting secrets:", error);
            return [];
        }
        return (data || []).map(r => ({
            id: r.id,
            name: r.name,
            provider: r.provider,
            expiresAt: r.expires_at,
            maskedKey: 'sk-...abcd',
            createdAt: r.created_at
        }));
    }
    return this.getSecrets(userId);
  }

  getSecrets(userId: string): any[] {
    if (this.isSupabase) {
        console.warn("getSecrets called synchronously in Supabase mode.");
        return [];
    }
    if (this.db) {
        const rows = this.db.query(`SELECT id, name, secret, provider, expires_at, created_at FROM vault_user_secrets WHERE user_id = ?`).all(userId) as any[];
        return rows.map(r => ({
            id: r.id,
            name: r.name,
            secret: r.secret,
            provider: r.provider,
            expiresAt: r.expires_at,
            maskedKey: 'sk-...abcd', // This will be dynamically overridden by the route using the decrypted secret
            createdAt: r.created_at
        }));
    }
    return [];
  }

  async deleteSecretAsync(userId: string, secretId: string) {
    if (this.isSupabase && this.supabase) {
        await this.supabase.from('vault_user_secrets').delete().eq('id', secretId).eq('user_id', userId);
        return;
    }
    this.deleteSecret(userId, secretId);
  }

  deleteSecret(userId: string, secretId: string) {
    if (this.isSupabase) {
        this.deleteSecretAsync(userId, secretId).then();
        return;
    }
    if (this.db) {
        this.db.run(`DELETE FROM vault_user_secrets WHERE id = ? AND user_id = ?`, [secretId, userId]);
    }
  }

  async setPlatformUserAsync(userId: string, supabaseUrl: string, encryptedServiceRole: string) {
    if (this.isSupabase && this.supabase) {
        await this.supabase.from('platform_users').upsert({
            user_id: userId,
            supabase_url: supabaseUrl,
            encrypted_service_role: encryptedServiceRole
        });
        return;
    }
    this.setPlatformUser(userId, supabaseUrl, encryptedServiceRole);
  }

  setPlatformUser(userId: string, supabaseUrl: string, encryptedServiceRole: string) {
    if (this.isSupabase) {
        this.setPlatformUserAsync(userId, supabaseUrl, encryptedServiceRole).then();
        return;
    }
    if (this.db) {
        this.db.run(
            `INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role) VALUES (?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET supabase_url = excluded.supabase_url, encrypted_service_role = excluded.encrypted_service_role`,
            [userId, supabaseUrl, encryptedServiceRole]
        );
    }
  }

  async getPlatformUserAsync(userId: string): Promise<any> {
    if (this.isSupabase && this.supabase) {
        const { data } = await this.supabase
          .from('platform_users')
          .select('*')
          .eq('user_id', userId)
          .single();
        return data;
    }
    return this.getPlatformUser(userId);
  }

  getPlatformUser(userId: string): any {
    if (this.isSupabase) return null;
    if (this.db) {
        return this.db.query(`SELECT * FROM platform_users WHERE user_id = ?`).get(userId);
    }
    return null;
  }
}

export const getDbClient = () => {
   return new DBClient();
};
