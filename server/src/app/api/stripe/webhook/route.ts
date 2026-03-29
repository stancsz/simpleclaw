import { NextRequest, NextResponse } from 'next/server';
import { handleStripeWebhook } from '../../../../../../src/core/payments';
import { getDbClient } from '../../../../../../src/db/client';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    const db = getDbClient();

    // We pass the raw text payload to constructEvent
    const success = handleStripeWebhook(payload, signature, db);

    if (success) {
      return NextResponse.json({ received: true });
    } else {
      return NextResponse.json({ error: 'Webhook handler failed' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Stripe webhook error:', err);
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
  }
}
