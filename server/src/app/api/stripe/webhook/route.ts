import { NextRequest } from 'next/server';
import { handleStripeWebhook } from '@/../../src/core/payments';
import { getDbClient } from '@/../../src/db/client';

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('Missing stripe signature', { status: 400 });
    }

    const payload = await req.text();
    const db = getDbClient();

    const success = handleStripeWebhook(payload, signature, db);

    if (success) {
      return new Response('Webhook processed successfully', { status: 200 });
    } else {
      // In development/testing, you might still want to return 200 to Stripe so it doesn't retry endlessly
      // if it's just a non-supported event type, but if signature verification fails, it should be an error.
      // For simplicity, we just return 200 or 400 based on the boolean success.
      return new Response('Webhook handling failed or unhandled event', { status: 400 });
    }
  } catch (error: any) {
    console.error('Error processing Stripe webhook:', error);
    return new Response(`Webhook Error: ${error.message}`, { status: 500 });
  }
}
