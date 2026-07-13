import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ActorType, OrderStatus, QUEUE } from '@marhaba/shared';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

type ScheduledJob =
  | { kind: 'PLACE_SCHEDULED'; orderId: string }
  | { kind: 'RETRY_DELIVERY'; orderId: string };

/**
 * Delayed-job scheduling for scheduled deliveries and failed-delivery retries.
 * Backed by BullMQ on Redis so jobs survive restarts and run exactly once
 * across a horizontally-scaled API.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private queue!: Queue;
  private worker!: Worker;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  onModuleInit(): void {
    // BullMQ bundles its own ioredis typings; reuse our shared client instance.
    const connection = this.redis as unknown as ConnectionOptions;
    this.queue = new Queue(QUEUE.SCHEDULED_ORDERS, { connection });
    this.worker = new Worker(QUEUE.SCHEDULED_ORDERS, (job) => this.process(job), { connection });
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.id} failed: ${err.message}`),
    );
  }

  /** Enqueue a scheduled order to auto-place when its window arrives. */
  async schedulePlacement(orderId: string, runAt: Date): Promise<void> {
    const delay = Math.max(0, runAt.getTime() - Date.now());
    await this.queue.add(
      'place',
      { kind: 'PLACE_SCHEDULED', orderId },
      { delay, jobId: `place:${orderId}`, removeOnComplete: true },
    );
  }

  /** Enqueue a retry of a failed delivery. */
  async scheduleRetry(orderId: string, runAt: Date): Promise<void> {
    const delay = Math.max(0, runAt.getTime() - Date.now());
    await this.queue.add(
      'retry',
      { kind: 'RETRY_DELIVERY', orderId },
      { delay, jobId: `retry:${orderId}:${runAt.getTime()}`, removeOnComplete: true },
    );
  }

  private async process(job: Job): Promise<void> {
    const data = job.data as ScheduledJob;
    const order = await this.prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order) return;

    if (data.kind === 'PLACE_SCHEDULED' && order.status === OrderStatus.SCHEDULED) {
      await this.orders.transition(
        order.id,
        { to: OrderStatus.PLACED, reason: 'Scheduled window reached' },
        { type: ActorType.SYSTEM, id: null },
      );
    }
    if (data.kind === 'RETRY_DELIVERY' && order.status === OrderStatus.RETRY_SCHEDULED) {
      // Send back out for delivery with the currently-assigned driver.
      const to = order.driverId ? OrderStatus.OUT_FOR_DELIVERY : OrderStatus.ASSIGNED;
      await this.orders.transition(
        order.id,
        { to, reason: 'Retry window reached' },
        { type: ActorType.SYSTEM, id: null },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.worker?.close(), this.queue?.close()]);
  }
}
