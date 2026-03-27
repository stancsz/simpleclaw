// Use dynamic import or fallback type since we can't use bun:sqlite in Next.js edge/node runtime directly
// Use dynamic import or fallback type since we can't use bun:sqlite in Next.js edge/node runtime directly
// import { Database } from 'bun:sqlite';

export class DBClient {
  private db: any | null = null;
  private isSupabase = false;

  constructor(databaseUrl: string = process.env.DATABASE_URL || 'sqlite://local.db') {
    if (databaseUrl.startsWith('supabase://')) {
      this.isSupabase = true;
      // Note: In a real app we'd init a Supabase client here.
      // We are just simulating the DB interface locally for now per the SPEC.
      console.warn("Supabase connection mode active, but only partial mocked interface is available.");
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

  applyMigration(sql: string) {
    if (this.isSupabase) {
      console.warn("Migrations are usually handled by Supabase CLI, not the client code.");
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
    if (this.isSupabase) {
      console.warn("Mock createSession Supabase");
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
     if (this.isSupabase) {
        console.warn(`Mock updateSessionStatus to ${status}`);
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

  getTaskResults(sessionId: string): any[] {
    if (this.isSupabase) return [];
    if (this.db) {
        return this.db.query(`SELECT * FROM task_results WHERE session_id = ? ORDER BY created_at ASC`).all(sessionId) as any[];
    }
    return [];
  }

  getSession(sessionId: string): any {
    if (this.isSupabase) {
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

  updateSecret(userId: string, secretId: string, name?: string, secret?: string, expiresAt?: string | null) {
    if (this.isSupabase) {
        console.warn("updateSecret called in Supabase mode - requires direct Supabase client.");
        return;
    }
    if (this.db) {
        const updates: string[] = [];
        const params: any[] = [];

        if (name !== undefined) {
            updates.push(`name = ?`);
            params.push(name);
        }
        if (secret !== undefined) {
            updates.push(`secret = ?`);
            params.push(secret);
        }
        if (expiresAt !== undefined) {
            updates.push(`expires_at = ?`);
            params.push(expiresAt);
        }

        if (updates.length > 0) {
            params.push(secretId);
            params.push(userId);
            this.db.run(
                `UPDATE vault_user_secrets SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
                params
            );

            // Log update audit event
            this.writeAuditLog(secretId, 'secret_updated', { secret_id: secretId, fields_updated: updates.map(u => u.split(' ')[0]) });
        }
    }
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

  logTransaction(key: string, status: string, result: any) {
    if (this.isSupabase) return;
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
    if (this.isSupabase) {
      console.warn(`Mock logTaskResult Supabase for ${workerId}`);
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
    if (this.isSupabase) return;
    if (this.db) {
        const id = crypto.randomUUID();
        this.db.run(
            `INSERT INTO audit_log (id, session_id, event, metadata) VALUES (?, ?, ?, ?)`,
            [id, sessionId, event, JSON.stringify(metadata)]
        );
    }
  }

  getAuditLogs(sessionId: string): any[] {
    if (this.isSupabase) return [];
    if (this.db) {
        return this.db.query(`SELECT * FROM audit_log WHERE session_id = ? ORDER BY created_at ASC`).all(sessionId) as any[];
    }
    return [];
  }

  simulateReadSecret(secretId: string): string | null {
    if (this.isSupabase) return "MOCK_SUPABASE_SECRET";

    if (this.db) {
        const row = this.db.query(`SELECT secret FROM vault_user_secrets WHERE id = ?`).get(secretId) as any;

        // Log access simulation
        this.writeAuditLog('', 'secret_accessed', { secret_id: secretId });

        return row ? row.secret : null;
    }
    return null;
  }

  addSecret(userId: string, name: string, secret: string, provider: string, expiresAt?: string | null) {
    // BYOK Phase 1 vault
    if (this.isSupabase) {
        // In Supabase mode, we would use the Supabase client with Row Level Security
        // For now, mock behavior for testing
        console.warn("addSecret called in Supabase mode - using mock implementation for testing.");
        const mockId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return mockId;
    }
    if (this.db) {
        const id = crypto.randomUUID();
        this.db.run(
            `INSERT INTO vault_user_secrets (id, user_id, name, secret, provider, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, userId, name, secret, provider, expiresAt || null]
        );
        this.writeAuditLog(id, 'secret_created', { provider, expires_at: expiresAt });
        return id;
    }
    return null;
  }

  getSecrets(userId: string): any[] {
    if (this.isSupabase) {
        console.warn("getSecrets called in Supabase mode - requires direct Supabase client.");
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

  deleteSecret(userId: string, secretId: string) {
    if (this.isSupabase) {
        console.warn("deleteSecret called in Supabase mode - requires direct Supabase client.");
        return;
    }
    if (this.db) {
        this.db.run(`DELETE FROM vault_user_secrets WHERE id = ? AND user_id = ?`, [secretId, userId]);
        this.writeAuditLog(secretId, 'secret_deleted', { secret_id: secretId });
    }
  }

  setPlatformUser(userId: string, supabaseUrl: string, encryptedServiceRole: string) {
    if (this.isSupabase) return;
    if (this.db) {
        this.db.run(
            `INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role) VALUES (?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET supabase_url = excluded.supabase_url, encrypted_service_role = excluded.encrypted_service_role`,
            [userId, supabaseUrl, encryptedServiceRole]
        );
    }
  }

  getPlatformUser(userId: string): any {
    if (this.isSupabase) return null;
    if (this.db) {
        return this.db.query(`SELECT * FROM platform_users WHERE user_id = ?`).get(userId);
    }
    return null;
  }

  getGasBalance(userId: string): number {
    if (this.isSupabase) {
        console.warn("getGasBalance called in Supabase mode - using mock implementation.");
        return 1000;
    }
    if (this.db) {
        let row = this.db.query(`SELECT balance_credits FROM gas_ledger WHERE user_id = ?`).get(userId) as any;
        if (!row) {
            // Give new users 10 free credits for testing
            this.db.run(`INSERT INTO gas_ledger (id, user_id, balance_credits) VALUES (?, ?, ?)`, [crypto.randomUUID(), userId, 10]);
            row = { balance_credits: 10 };
        }
        return row.balance_credits;
    }
    return 0;
  }

  incrementGasBalance(userId: string, amount: number) {
    if (this.isSupabase) {
        console.warn("incrementGasBalance called in Supabase mode.");
        return;
    }
    if (this.db) {
        // Ensure user exists in ledger
        this.getGasBalance(userId);

        this.db.run(
            `UPDATE gas_ledger SET balance_credits = balance_credits + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
            [amount, userId]
        );
        this.writeAuditLog(userId, 'gas_purchased', { amount });
    }
  }

  decrementGasBalance(userId: string, amount: number) {
    if (this.isSupabase) {
        console.warn("decrementGasBalance called in Supabase mode.");
        return;
    }
    if (this.db) {
        this.db.run(
            `UPDATE gas_ledger SET balance_credits = balance_credits - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND balance_credits >= ?`,
            [amount, userId, amount]
        );
        this.writeAuditLog(userId, 'gas_consumed', { amount });
    }
  }
}

export const getDbClient = () => {
   return new DBClient();
};
