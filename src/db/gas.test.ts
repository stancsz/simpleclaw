import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { DBClient } from "./client";
import {
  hasSufficientGas,
  consumeGas,
  addGasCredits,
  handleStripeWebhook,
  stripe
} from "../core/gas";

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
      CREATE TABLE IF NOT EXISTS transaction_log (
        idempotency_key TEXT PRIMARY KEY,
        status TEXT,
        result TEXT,
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

  test("handleStripeWebhook ensures idempotency to prevent duplicate credits", async () => {
    const testStripeUserId = "test-idempotent-user";
    const testPayload = {
      id: "evt_idempotent_test",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_idempotent_test",
          object: "checkout.session",
          client_reference_id: testStripeUserId,
          metadata: {
            userId: testStripeUserId,
            credits: "500"
          }
        }
      }
    };

    const originalConstructEvent = stripe.webhooks.constructEvent;

    try {
      stripe.webhooks.constructEvent = (payload, sig, secret) => {
        return testPayload as any;
      };

      // Ensure base balance is 10
      expect(db.getGasBalance(testStripeUserId)).toBe(10);

      // 1. Process for the first time
      const success1 = handleStripeWebhook("mock_payload", "mock_sig", db);
      expect(success1).toBe(true);

      // Should be 10 + 500
      let balance = db.getGasBalance(testStripeUserId);
      expect(balance).toBe(510);

      // 2. Process the exact same event again
      const success2 = handleStripeWebhook("mock_payload", "mock_sig", db);
      expect(success2).toBe(true); // Should return true to acknowledge but skip processing

      // Balance should REMAIN 510, it should NOT add another 500
      balance = db.getGasBalance(testStripeUserId);
      expect(balance).toBe(510);

    } finally {
      // Restore
      stripe.webhooks.constructEvent = originalConstructEvent;
    }
  });

  test("handleStripeWebhook fails gracefully on missing metadata", async () => {
    const testPayload = {
      id: "evt_missing_meta",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_missing_meta",
          object: "checkout.session",
          // missing client_reference_id and metadata
        }
      }
    };

    const originalConstructEvent = stripe.webhooks.constructEvent;

    try {
      stripe.webhooks.constructEvent = (payload, sig, secret) => {
        return testPayload as any;
      };

      // We expect console.error, but let's just check the return status
      const success = handleStripeWebhook("mock_payload", "mock_sig", db);
      expect(success).toBe(false);

    } finally {
      stripe.webhooks.constructEvent = originalConstructEvent;
    }
  });

  test("handleStripeWebhook fails gracefully on bad signature", async () => {
    const originalConstructEvent = stripe.webhooks.constructEvent;

    try {
      stripe.webhooks.constructEvent = (payload, sig, secret) => {
        throw new Error("Invalid signature");
      };

      const success = handleStripeWebhook("mock_payload", "bad_sig", db);
      expect(success).toBe(false);

    } finally {
      stripe.webhooks.constructEvent = originalConstructEvent;
    }
  });
});