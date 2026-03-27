import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import {
  hasSufficientGas,
  consumeGas,
  addGasCredits,
  handleStripeWebhook,
  stripe,
  STRIPE_WEBHOOK_SECRET
} from "./gas";

describe("Gas Ledger System", () => {
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

  afterEach(() => {
    // Reset DB state manually since it's an in-memory instance
  });

  test("New user should receive 10 initial credits", () => {
    const balance = db.getGasBalance("brand-new-user");
    expect(balance).toBe(10);
  });

  test("hasSufficientGas returns true when balance > 0", async () => {
    await addGasCredits(testUserId, 100, db); // ensures user exists and adds balance

    // Balance will be 110: 10 initial + 100 added
    const balance = db.getGasBalance(testUserId);
    expect(balance).toBe(110);

    const hasGas = await hasSufficientGas(testUserId, db);
    expect(hasGas).toBe(true);
  });

  test("consumeGas deducts amount and returns true if sufficient", async () => {
    // We should use a different unique ID so it doesn't collide with previous test mutations
    const testConsumeId = "test-consume-user";

    // User gets 10 credits by default upon checking
    db.getGasBalance(testConsumeId);

    const consumed = await consumeGas(testConsumeId, 5, db);
    expect(consumed).toBe(true);

    const balance = db.getGasBalance(testConsumeId);
    expect(balance).toBe(5);
  });

  test("consumeGas returns false and leaves balance intact if insufficient", async () => {
    // default 10 credits
    const balanceBefore = db.getGasBalance("test-user-insufficient");
    expect(balanceBefore).toBe(10);

    const consumed = await consumeGas("test-user-insufficient", 20, db);
    expect(consumed).toBe(false);

    const balance = db.getGasBalance("test-user-insufficient");
    expect(balance).toBe(10);
  });

  test("handleStripeWebhook processes checkout.session.completed", async () => {
    const testStripeUserId = "test-stripe-user";
    const testPayload = {
      id: "evt_test",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          object: "checkout.session",
          client_reference_id: testStripeUserId,
          metadata: {
            userId: testStripeUserId,
            credits: "1000"
          }
        }
      }
    };

    // Mock stripe webhook constructEvent
    const originalConstructEvent = stripe.webhooks.constructEvent;

    try {
      stripe.webhooks.constructEvent = (payload, sig, secret) => {
        return testPayload as any;
      };

      const success = handleStripeWebhook("mock_payload", "mock_sig", db);
      expect(success).toBe(true);

      // Should be 10 (initial) + 1000
      const balance = db.getGasBalance(testStripeUserId);
      expect(balance).toBe(1010);

    } finally {
      // Restore
      stripe.webhooks.constructEvent = originalConstructEvent;
    }
  });
});
