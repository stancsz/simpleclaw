import { NextRequest } from 'next/server';
import { getDbClient } from '@/../../src/db/client';
import { createCheckoutSession, MIN_CREDIT_PURCHASE } from '@/../../src/core/gas';

export async function GET(req: NextRequest) {
  try {
    const db = getDbClient();
    const userId = 'test-user'; // Hardcoded for Phase 0 since there's no real auth yet

    const balance = db.getGasBalance(userId);

    return Response.json({ status: 'success', balance }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching gas balance:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = 'test-user'; // Hardcoded for Phase 0
    // Get protocol and host to form the absolute origin URL for Stripe redirects
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const originUrl = `${protocol}://${host}`;

    const checkoutUrl = await createCheckoutSession(userId, MIN_CREDIT_PURCHASE, originUrl);

    if (checkoutUrl) {
      return Response.json({ status: 'success', url: checkoutUrl }, { status: 200 });
    } else {
      return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error creating gas checkout:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
