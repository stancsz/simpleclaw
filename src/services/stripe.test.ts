import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import { handleStripeWebhook, stripe } from "./stripe";

describe("Stripe Service", () => {
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
      CREATE TABLE IF NOT EXISTS transaction_log (
        idempotency_key TEXT PRIMARY KEY,
        status TEXT,
        result TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

    const originalConstructEvent = stripe.webhooks.constructEvent;

    try {
      stripe.webhooks.constructEvent = (payload, sig, secret) => {
        return testPayload as any;
      };

      const success = handleStripeWebhook("mock_payload", "mock_sig", db);
      expect(success).toBe(true);

      const balance = db.getGasBalance(testStripeUserId);
      expect(balance).toBe(1010);

    } finally {
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

      expect(db.getGasBalance(testStripeUserId)).toBe(10);

      const success1 = handleStripeWebhook("mock_payload", "mock_sig", db);
      expect(success1).toBe(true);

      let balance = db.getGasBalance(testStripeUserId);
      expect(balance).toBe(510);

      const success2 = handleStripeWebhook("mock_payload", "mock_sig", db);
      expect(success2).toBe(true);

      balance = db.getGasBalance(testStripeUserId);
      expect(balance).toBe(510);

    } finally {
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
        }
      }
    };

    const originalConstructEvent = stripe.webhooks.constructEvent;

    try {
      stripe.webhooks.constructEvent = (payload, sig, secret) => {
        return testPayload as any;
      };

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
