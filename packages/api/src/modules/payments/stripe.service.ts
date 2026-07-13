import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Thin Stripe wrapper. In environments without Stripe configured (local dev,
 * CI) the client is absent and card operations throw a clear 503 while
 * cash-on-delivery continues to work.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;
  readonly webhookSecret?: string;

  constructor(config: ConfigService) {
    const secretKey = config.get<string>('stripe.secretKey');
    this.webhookSecret = config.get<string>('stripe.webhookSecret');
    this.client = secretKey
      ? new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion })
      : null;
    if (!this.client) this.logger.warn('Stripe not configured — card payments disabled');
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  private require(): Stripe {
    if (!this.client) throw new ServiceUnavailableException('Card payments are not configured');
    return this.client;
  }

  /**
   * Create a PaymentIntent. `idempotencyKey` (Stripe-native) guarantees a
   * retried request never creates a second intent.
   */
  createPaymentIntent(
    params: Stripe.PaymentIntentCreateParams,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.require().paymentIntents.create(params, { idempotencyKey });
  }

  refund(
    paymentIntentId: string,
    amountMinor: number | undefined,
    idempotencyKey: string,
  ): Promise<Stripe.Refund> {
    return this.require().refunds.create(
      { payment_intent: paymentIntentId, amount: amountMinor },
      { idempotencyKey },
    );
  }

  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) throw new ServiceUnavailableException('Webhook secret not configured');
    return this.require().webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}
