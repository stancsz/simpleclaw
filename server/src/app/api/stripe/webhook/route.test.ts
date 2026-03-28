import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { POST } from "./route";
import { DBClient } from "../../../../../../src/db/client";
import * as gas from "../../../../../../src/core/gas";

describe("Stripe Webhook API Route", () => {
  let db: DBClient;

  beforeEach(() => {
    db = new DBClient("sqlite://:memory:");
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

    // Set Stripe webhook secret environment variable for the test
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  });

  afterEach(() => {
    mock.restore();
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  test("returns 400 when stripe-signature header is missing", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe("Missing stripe signature");
  });

  test("processes valid webhook and adds credits successfully", async () => {
    // Mock the handleStripeWebhook function
    mock.module("../../../../../../src/core/gas", () => ({
      ...gas,
      handleStripeWebhook: () => true
    }));

    // We must re-import the module to use the mock
    const { POST } = require("./route");

    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "valid_signature",
      },
      body: JSON.stringify({
        id: "evt_test",
        type: "checkout.session.completed",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Webhook processed successfully");

    // Clean up mock
    mock.module("../../../../../../src/core/gas", () => gas);
  });

  test("returns 400 when webhook handling fails (e.g. invalid signature)", async () => {
    // Mock the handleStripeWebhook function to return false
    mock.module("../../../../../../src/core/gas", () => ({
      ...gas,
      handleStripeWebhook: () => false
    }));

    const { POST } = require("./route");

    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "invalid_signature",
      },
      body: JSON.stringify({
        id: "evt_test",
        type: "checkout.session.completed",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe("Webhook handling failed or unhandled event");

    // Clean up mock
    mock.module("../../../../../../src/core/gas", () => gas);
  });
});