import { NextRequest } from 'next/server';
import { createCheckoutSession } from '@/../../src/core/payments';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, credits, originUrl } = body;

    if (!userId || !credits || !originUrl) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400 });
    }

    const sessionUrl = await createCheckoutSession(userId, credits, originUrl);

    if (sessionUrl) {
      return new Response(JSON.stringify({ url: sessionUrl }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), { status: 500 });
    }
  } catch (error: any) {
    console.error('Error creating Stripe checkout session:', error);
    return new Response(JSON.stringify({ error: `Internal Server Error: ${error.message}` }), { status: 500 });
  }
}
