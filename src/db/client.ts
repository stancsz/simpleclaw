import { Database } from 'bun:sqlite';

export class DBClient {
  private db: Database | null = null;
  private isSupabase = false;

  constructor(databaseUrl: string = process.env.DATABASE_URL || 'sqlite://local.db') {
    if (databaseUrl.startsWith('supabase://')) {
      this.isSupabase = true;
      // Note: In a real app we'd init a Supabase client here.
      // We are just simulating the DB interface locally for now per the SPEC.
      console.warn("Supabase connection mode active, but only partial mocked interface is available.");
    } else {
      const dbPath = databaseUrl.replace('sqlite://', '');
      this.db = new Database(dbPath, { create: true });
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
        this.writeAuditLog(sessionId, 'plan_approved', { status });
     }
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

  simulateReadSecret(secretId: string): string {
    if (this.isSupabase) return "MOCK_SUPABASE_SECRET";

    if (this.db) {
        const row = this.db.query(`SELECT secret FROM vault_user_secrets WHERE id = ?`).get(secretId) as any;

        // Log access simulation
        this.writeAuditLog('', 'secret_accessed', { secret_id: secretId });

        return row ? row.secret : null;
    }
    return "";
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
}

export const getDbClient = () => {
   return new DBClient();
};
