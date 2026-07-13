import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  OrderEventType,
  PaymentMethod,
  PaymentStatus,
  type PaymentIntentResponse,
} from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderEventsService } from '../orders/order-events.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StripeService } from './stripe.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly events: OrderEventsService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Create (or return the existing) PaymentIntent for a card order. The
   * Idempotency-Key interceptor guards the HTTP layer; the Stripe-native
   * idempotency key guards Stripe itself.
   */
  async createPaymentIntent(orderId: string, userId: string): Promise<PaymentIntentResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.clientId !== userId) throw new BadRequestException('Not your order');
    if (order.paymentMethod !== PaymentMethod.CARD) {
      throw new BadRequestException('Order is not a card order');
    }

    // Reuse an in-flight intent if one already exists.
    if (order.payment?.stripePaymentIntentId) {
      return {
        paymentId: order.payment.id,
        clientSecret: null,
        status: order.payment.status as PaymentStatus,
        amountMinor: order.payment.amountMinor,
        currency: order.payment.currency,
      };
    }

    const intent = await this.stripe.createPaymentIntent(
      {
        amount: order.totalMinor,
        currency: order.currency.toLowerCase(),
        metadata: { orderId: order.id, reference: order.reference },
        automatic_payment_methods: { enabled: true },
      },
      `pi_${order.id}`,
    );

    const payment = await this.prisma.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        method: PaymentMethod.CARD,
        status: PaymentStatus.PENDING,
        amountMinor: order.totalMinor,
        currency: order.currency,
        stripePaymentIntentId: intent.id,
      },
      update: { stripePaymentIntentId: intent.id, status: PaymentStatus.PENDING },
    });

    await this.events.record({
      orderId: order.id,
      type: OrderEventType.PAYMENT_INITIATED,
      actorType: ActorType.CLIENT,
      actorId: userId,
      metadata: { paymentIntentId: intent.id, amountMinor: order.totalMinor },
    });

    return {
      paymentId: payment.id,
      clientSecret: intent.client_secret,
      status: PaymentStatus.PENDING,
      amountMinor: order.totalMinor,
      currency: order.currency,
    };
  }

  /** Driver confirms cash collected on delivery. */
  async confirmCash(orderId: string, collectedMinor: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentMethod !== PaymentMethod.CASH_ON_DELIVERY) {
      throw new BadRequestException('Order is not cash-on-delivery');
    }
    const payment = await this.prisma.payment.upsert({
      where: { orderId },
      create: {
        orderId,
        method: PaymentMethod.CASH_ON_DELIVERY,
        status: PaymentStatus.CAPTURED,
        amountMinor: order.totalMinor,
        currency: order.currency,
        collectedMinor,
      },
      update: { status: PaymentStatus.CAPTURED, collectedMinor },
    });
    await this.events.record({
      orderId,
      type: OrderEventType.PAYMENT_SUCCEEDED,
      actorType: ActorType.DRIVER,
      metadata: { method: 'CASH', collectedMinor },
    });
    return payment;
  }

  /**
   * Idempotently handle a verified Stripe webhook event. Dedup is enforced via
   * ProcessedWebhookEvent so re-deliveries are safe.
   */
  async handleWebhookEvent(event: {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  }): Promise<{ handled: boolean }> {
    const already = await this.prisma.processedWebhookEvent.findUnique({ where: { id: event.id } });
    if (already) return { handled: false };

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.onPaymentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.onPaymentFailed(event.data.object);
          break;
        case 'charge.refunded':
          await this.onRefunded(event.data.object);
          break;
        default:
          this.logger.debug(`Unhandled Stripe event ${event.type}`);
      }
    } finally {
      await this.prisma.processedWebhookEvent.create({
        data: { id: event.id, type: event.type },
      });
    }
    return { handled: true };
  }

  private async onPaymentSucceeded(intent: Record<string, unknown>) {
    const orderId = (intent.metadata as Record<string, string> | undefined)?.orderId;
    if (!orderId) return;
    await this.prisma.payment.updateMany({
      where: { orderId },
      data: { status: PaymentStatus.CAPTURED, stripeChargeId: (intent.latest_charge as string) ?? null },
    });
    await this.events.record({
      orderId,
      type: OrderEventType.PAYMENT_SUCCEEDED,
      actorType: ActorType.WEBHOOK,
      metadata: { paymentIntentId: intent.id },
    });
    this.realtime.emitOrderStatus(orderId, 'PLACED' as never, { paid: true });
  }

  private async onPaymentFailed(intent: Record<string, unknown>) {
    const orderId = (intent.metadata as Record<string, string> | undefined)?.orderId;
    if (!orderId) return;
    await this.prisma.payment.updateMany({
      where: { orderId },
      data: { status: PaymentStatus.FAILED },
    });
    await this.events.record({
      orderId,
      type: OrderEventType.PAYMENT_FAILED,
      actorType: ActorType.WEBHOOK,
      metadata: { paymentIntentId: intent.id },
    });
  }

  private async onRefunded(charge: Record<string, unknown>) {
    const orderId = (charge.metadata as Record<string, string> | undefined)?.orderId;
    const amountRefunded = Number(charge.amount_refunded ?? 0);
    if (!orderId) return;
    await this.prisma.payment.updateMany({
      where: { orderId },
      data: { status: PaymentStatus.REFUNDED, refundedMinor: amountRefunded },
    });
    await this.events.record({
      orderId,
      type: OrderEventType.REFUNDED,
      actorType: ActorType.WEBHOOK,
      metadata: { amountRefunded },
    });
  }
}
