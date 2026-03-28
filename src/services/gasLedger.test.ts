import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import { hasSufficientGas, debitCredits, addGasCredits, getBalance } from "./gasLedger";

describe("Gas Ledger Service", () => {
  let db: DBClient;
  const testUserId = "test-gas-user";

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

  test("New user should receive 10 initial credits", () => {
    const balance = getBalance("brand-new-user", db);
    expect(balance).toBe(10);
  });

  test("hasSufficientGas returns true when balance > 0", async () => {
    await addGasCredits(testUserId, 100, db);

    const balance = getBalance(testUserId, db);
    expect(balance).toBe(110);

    const hasGas = await hasSufficientGas(testUserId, db);
    expect(hasGas).toBe(true);
  });

  test("debitCredits deducts amount and returns true if sufficient", async () => {
    const testConsumeId = "test-consume-user";

    // Check balance to create it with 10 initially
    getBalance(testConsumeId, db);

    const consumed = await debitCredits(testConsumeId, 5, db);
    expect(consumed).toBe(true);

    const balance = getBalance(testConsumeId, db);
    expect(balance).toBe(5);
  });

  test("debitCredits returns false and leaves balance intact if insufficient", async () => {
    const balanceBefore = getBalance("test-user-insufficient", db);
    expect(balanceBefore).toBe(10);

    const consumed = await debitCredits("test-user-insufficient", 20, db);
    expect(consumed).toBe(false);

    const balance = getBalance("test-user-insufficient", db);
    expect(balance).toBe(10);
  });
});
