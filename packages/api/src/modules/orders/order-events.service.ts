import { Injectable } from '@nestjs/common';
import { type ActorType, type OrderEventType, type OrderStatus } from '@marhaba/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface RecordEventArgs {
  orderId: string;
  type: OrderEventType;
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
  actorType?: ActorType;
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Optional transaction client so the event is written atomically. */
  tx?: Prisma.TransactionClient;
}

/**
 * Writes to the append-only OrderEvent audit log. This trail is the source of
 * truth for the order timeline and driver performance analytics.
 */
@Injectable()
export class OrderEventsService {
  constructor(private readonly prisma: PrismaService) {}

  record(args: RecordEventArgs) {
    const client = args.tx ?? this.prisma;
    return client.orderEvent.create({
      data: {
        orderId: args.orderId,
        type: args.type,
        fromStatus: args.fromStatus ?? null,
        toStatus: args.toStatus ?? null,
        actorType: args.actorType ?? 'SYSTEM',
        actorId: args.actorId ?? null,
        metadata: (args.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  timeline(orderId: string) {
    return this.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
