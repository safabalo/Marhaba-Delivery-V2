import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  OrderEventType,
  OrderStatus,
  ProofOfDeliveryType,
  redisKeys,
  type RecordDeliveryFailureInput,
  type SubmitProofOfDeliveryInput,
} from '@marhaba/shared';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { OrderEventsService } from '../orders/order-events.service';
import { OrdersService } from '../orders/orders.service';
import { StorageService } from '../storage/storage.service';
import { SchedulerService } from '../scheduler/scheduler.service';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly orders: OrdersService,
    private readonly events: OrderEventsService,
    private readonly storage: StorageService,
    private readonly scheduler: SchedulerService,
  ) {}

  // --- Failed delivery workflow -------------------------------------------

  async recordFailure(orderId: string, driverUserId: string, input: RecordDeliveryFailureInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY && order.status !== OrderStatus.EN_ROUTE_TO_PICKUP) {
      throw new BadRequestException('Order is not out for delivery');
    }

    const priorAttempts = await this.prisma.deliveryAttempt.count({ where: { orderId } });
    await this.prisma.deliveryAttempt.create({
      data: {
        orderId,
        attemptNumber: priorAttempts + 1,
        succeeded: false,
        failureReason: input.reason,
        notes: input.notes ?? null,
        lng: input.lng ?? null,
        lat: input.lat ?? null,
      },
    });
    await this.events.record({
      orderId,
      type: OrderEventType.DELIVERY_FAILED,
      actorType: ActorType.DRIVER,
      actorId: driverUserId,
      metadata: { reason: input.reason, attempt: priorAttempts + 1, notes: input.notes },
    });

    // Move to FAILED, then resolve.
    await this.orders.transition(
      orderId,
      { to: OrderStatus.FAILED, reason: input.reason },
      { type: ActorType.DRIVER, id: driverUserId },
    );

    switch (input.resolution) {
      case 'RETRY':
      case 'RESCHEDULE': {
        const runAt = input.rescheduleFor ?? new Date(Date.now() + 60 * 60 * 1000);
        await this.orders.transition(
          orderId,
          { to: OrderStatus.RETRY_SCHEDULED, metadata: { rescheduleFor: runAt } },
          { type: ActorType.SYSTEM, id: null },
        );
        await this.scheduler.scheduleRetry(orderId, runAt);
        return { status: OrderStatus.RETRY_SCHEDULED, rescheduleFor: runAt };
      }
      case 'RETURN': {
        await this.orders.transition(
          orderId,
          { to: OrderStatus.RETURNED, reason: 'Returned after failed delivery' },
          { type: ActorType.DRIVER, id: driverUserId },
        );
        return { status: OrderStatus.RETURNED };
      }
      default:
        throw new BadRequestException('Unknown resolution');
    }
  }

  // --- Proof of delivery ---------------------------------------------------

  /** Generate & store a 6-digit OTP the customer reads out to the driver. */
  async issueOtp(orderId: string): Promise<{ expiresInSeconds: number }> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ttl = 900;
    await this.redis.set(redisKeys.otp(orderId), code, ttl);
    // In production this is delivered to the customer via NotificationsService.
    return { expiresInSeconds: ttl };
  }

  async submitProof(orderId: string, driverUserId: string, input: SubmitProofOfDeliveryInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw new BadRequestException('Order must be out for delivery to complete');
    }

    let otpVerified: boolean | null = null;
    let photoUrl: string | null = null;
    let signatureUrl: string | null = null;

    if (input.type === ProofOfDeliveryType.OTP_CODE) {
      const expected = await this.redis.get<string>(redisKeys.otp(orderId));
      otpVerified = !!expected && expected === input.otpCode;
      if (!otpVerified) throw new BadRequestException('Invalid or expired OTP');
      await this.redis.del(redisKeys.otp(orderId));
    } else if (input.type === ProofOfDeliveryType.PHOTO) {
      photoUrl = this.storage.publicUrlFor(input.photoKey!);
    } else if (input.type === ProofOfDeliveryType.SIGNATURE) {
      signatureUrl = this.storage.publicUrlFor(input.signatureKey!);
    }

    const proof = await this.prisma.proofOfDelivery.upsert({
      where: { orderId },
      create: {
        orderId,
        type: input.type,
        photoUrl,
        signatureUrl,
        otpVerified,
        lng: input.lng,
        lat: input.lat,
        capturedAt: input.capturedAt,
      },
      update: { type: input.type, photoUrl, signatureUrl, otpVerified, lng: input.lng, lat: input.lat },
    });

    await this.orders.transition(
      orderId,
      { to: OrderStatus.DELIVERED, metadata: { proofType: input.type } },
      { type: ActorType.DRIVER, id: driverUserId },
    );

    return proof;
  }

  /** Presign an upload for a POD photo/signature before submission. */
  presignPodUpload(kind: 'pod' | 'signatures', contentType = 'image/jpeg') {
    const key = this.storage.buildKey(kind, contentType.includes('png') ? 'png' : 'jpg');
    return this.storage.presignUpload(key, contentType);
  }
}
