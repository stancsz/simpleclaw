import { test, expect, describe, mock, afterEach } from "bun:test";
import { POST } from "./route";

// Global Mocks for next/server and internal dependencies
mock.module("next/server", () => {
  return {
    NextResponse: {
      json: (body: any, init?: any) => {
        return { body, status: init?.status || 200 };
      }
    }
  };
});

let handleStripeWebhookMock: ReturnType<typeof mock>;
mock.module("../../../../../../src/core/payments", () => {
  handleStripeWebhookMock = mock((payload: any, sig: any, db: any) => {
    if (sig === "valid_sig") return true;
    return false;
  });
  return {
    handleStripeWebhook: handleStripeWebhookMock
  };
});

mock.module("../../../../../../src/db/client", () => {
  return {
    getDbClient: () => ({ mockDbClient: true })
  };
});

describe("Stripe Webhook API Route", () => {
  afterEach(() => {
    handleStripeWebhookMock.mockClear();
  });

  test("returns 400 if stripe-signature is missing", async () => {
    // Create a mock request object manually that behaves like NextRequest
    const req = {
      text: async () => "{}",
      headers: {
        get: (name: string) => null
      }
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing stripe-signature header' });
  });

  test("calls handleStripeWebhook and returns 200 on success", async () => {
    const payload = '{"id":"evt_123"}';
    const req = {
      text: async () => payload,
      headers: {
        get: (name: string) => name === 'stripe-signature' ? 'valid_sig' : null
      }
    } as any;

    const res = await POST(req);

    expect(handleStripeWebhookMock).toHaveBeenCalledTimes(1);
    expect(handleStripeWebhookMock.mock.calls[0][0]).toBe(payload);
    expect(handleStripeWebhookMock.mock.calls[0][1]).toBe('valid_sig');
    expect(handleStripeWebhookMock.mock.calls[0][2]).toEqual({ mockDbClient: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test("returns 400 if handleStripeWebhook returns false", async () => {
    const payload = '{"id":"evt_123"}';
    const req = {
      text: async () => payload,
      headers: {
        get: (name: string) => name === 'stripe-signature' ? 'invalid_sig' : null
      }
    } as any;

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Webhook handler failed' });
  });

  test("catches errors and returns 400", async () => {
    // Force an error to be thrown by returning a request with a text() method that throws
    const req = {
      text: async () => { throw new Error("Network error") },
      headers: {
        get: (name: string) => 'valid_sig'
      }
    } as any;

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Webhook Error' });
  });
});