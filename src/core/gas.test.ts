import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { checkGasBalance, debitGas } from "./gas";

describe("Gas Ledger Core", () => {
  let db: DBClient;

  beforeEach(() => {
    db = new DBClient("sqlite://:memory:");

    // Create base tables needed for testing
    db.applyMigration(`
      CREATE TABLE IF NOT EXISTS gas_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        balance_credits INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        event TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  describe("checkGasBalance", () => {
    test("returns true if balance is at least 1", () => {
      // getGasBalance adds 10 default credits on missing user
      const result = checkGasBalance("user-with-balance", db);
      expect(result).toBe(true);

      const logs = db.getAuditLogs('system');
      expect(logs.some(l => l.event === 'low_gas_balance_warning')).toBe(true);
    });

    test("returns false if balance is less than 1", () => {
      // Manually set balance to 0
      db.db.run(`INSERT INTO gas_ledger (id, user_id, balance_credits) VALUES ('1', 'user-no-balance', 0)`);

      const result = checkGasBalance("user-no-balance", db);
      expect(result).toBe(false);
    });

    test("logs low gas warning if balance is less than 100", () => {
      db.db.run(`INSERT INTO gas_ledger (id, user_id, balance_credits) VALUES ('2', 'user-low-balance', 50)`);

      checkGasBalance("user-low-balance", db);

      const logs = db.getAuditLogs('system');
      expect(logs.some(l => l.event === 'low_gas_balance_warning')).toBe(true);
    });

    test("does not log low gas warning if balance is 100 or more", () => {
      db.db.run(`INSERT INTO gas_ledger (id, user_id, balance_credits) VALUES ('3', 'user-high-balance', 100)`);

      checkGasBalance("user-high-balance", db);

      const logs = db.getAuditLogs('system');
      expect(logs.some(l => l.event === 'low_gas_balance_warning')).toBe(false);
    });
  });

  describe("debitGas", () => {
    test("successfully debits gas if sufficient balance", async () => {
      db.db.run(`INSERT INTO gas_ledger (id, user_id, balance_credits) VALUES ('4', 'user-debit', 5)`);

      const result = await debitGas("user-debit", 2, db);
      expect(result).toBe(true);

      const balance = db.getGasBalance("user-debit");
      expect(balance).toBe(3);
    });

    test("throws an error if insufficient balance", async () => {
      db.db.run(`INSERT INTO gas_ledger (id, user_id, balance_credits) VALUES ('5', 'user-poor', 1)`);

      expect(debitGas("user-poor", 2, db)).rejects.toThrow('Insufficient gas credits');

      const balance = db.getGasBalance("user-poor");
      expect(balance).toBe(1);
    });
  });
});
