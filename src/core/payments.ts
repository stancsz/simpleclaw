import Stripe from 'stripe';
import { stripe, STRIPE_WEBHOOK_SECRET } from './stripe';

export async function createCheckoutSession(userId: string, credits: number, originUrl: string): Promise<string | null> {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'SimpleClaw Swarm Gas Credits',
              description: `${credits} execution credits for your autonomous agents.`,
            },
            // Assuming $10 for 1000 credits -> 1 cent per credit. Let's make unit amount credits * 1 for $0.01/each
            unit_amount: Math.round(1000 * 1), // $10.00
          },
          quantity: 1, // Or we could use variable credits, but simplest is 1 package
        },
      ],
      mode: 'payment',
      success_url: `${originUrl}?session_id={CHECKOUT_SESSION_ID}&gas_purchase=success`,
      cancel_url: `${originUrl}?gas_purchase=cancelled`,
      client_reference_id: userId,
      metadata: {
        userId: userId,
        credits: credits.toString()
      }
    });

    return session.url;
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    return null;
  }
}

export function handleStripeWebhook(payload: string | Buffer, signature: string, db: import('../db/client').DBClient): boolean {
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      STRIPE_WEBHOOK_SECRET
    );

    if (event.type === 'checkout.session.completed') {
      if (db.checkIdempotency(event.id)) {
        console.log(`Duplicate Stripe webhook event detected and skipped: ${event.id}`);
        return true;
      }

      const session = event.data.object as Stripe.Checkout.Session;

      const userId = session.client_reference_id || session.metadata?.userId;
      const creditsStr = session.metadata?.credits;

      if (userId && creditsStr) {
        const credits = parseInt(creditsStr, 10);
        if (!isNaN(credits)) {
           // To avoid circular dependency, use gasLedger db method directly
           db.incrementGasBalance(userId, credits);
           db.logTransaction(event.id, 'completed', { amount: credits });
           console.log(`Successfully added ${credits} gas to user ${userId}`);
           return true;
        }
      }
      console.error("Missing userId or credits in session metadata for gas topup");
    }
    return false;
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return false;
  }
}
