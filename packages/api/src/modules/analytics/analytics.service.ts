import { Injectable } from '@nestjs/common';
import {
  OrderEventType,
  OrderStatus,
  type DispatchBoardOrder,
  type DriverPerformance,
} from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Driver performance analytics computed from the append-only OrderEvent trail,
 * plus the dispatcher live board. Because every state change is journaled we
 * can reconstruct accept/pickup/delivery durations without extra tracking.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async driverPerformance(driverId: string, from: Date, to: Date): Promise<DriverPerformance> {
    const orders = await this.prisma.order.findMany({
      where: { driverId, createdAt: { gte: from, lte: to } },
      select: { id: true, events: { orderBy: { createdAt: 'asc' } } },
    });

    let completed = 0;
    let failed = 0;
    const acceptDurations: number[] = [];
    const pickupDurations: number[] = [];
    const deliveryDurations: number[] = [];

    for (const order of orders) {
      const at = (type: OrderEventType) =>
        order.events.find((e) => e.type === type)?.createdAt.getTime();

      const assigned = at(OrderEventType.ASSIGNED);
      const accepted = at(OrderEventType.DRIVER_ACCEPTED);
      const pickedUp = at(OrderEventType.PICKED_UP);
      const delivered = at(OrderEventType.DELIVERED);
      const didFail = order.events.some((e) => e.type === OrderEventType.DELIVERY_FAILED);

      if (delivered) completed++;
      if (didFail) failed++;

      if (assigned && accepted) acceptDurations.push((accepted - assigned) / 1000);
      if (accepted && pickedUp) pickupDurations.push((pickedUp - accepted) / 1000);
      if (pickedUp && delivered) deliveryDurations.push((delivered - pickedUp) / 1000);
    }

    const total = completed + failed;
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      select: { ratingAvg: true },
    });

    return {
      driverId,
      windowFrom: from,
      windowTo: to,
      deliveriesCompleted: completed,
      deliveriesFailed: failed,
      successRate: total ? completed / total : 0,
      avgAcceptSeconds: avg(acceptDurations),
      avgPickupSeconds: avg(pickupDurations),
      avgDeliverySeconds: avg(deliveryDurations),
      onTimeRate: null, // requires promised-ETA capture; wired in a later phase
      ratingAvg: profile?.ratingAvg ?? null,
    };
  }

  /** The dispatcher live board: all in-flight orders. */
  async dispatchBoard(): Promise<DispatchBoardOrder[]> {
    const active = await this.prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.PLACED,
            OrderStatus.ACCEPTED,
            OrderStatus.ASSIGNED,
            OrderStatus.EN_ROUTE_TO_PICKUP,
            OrderStatus.PICKED_UP,
            OrderStatus.OUT_FOR_DELIVERY,
            OrderStatus.FAILED,
            OrderStatus.RETRY_SCHEDULED,
            OrderStatus.SCHEDULED,
          ],
        },
      },
      include: { driver: { include: { user: { select: { fullName: true } } } } },
      orderBy: { createdAt: 'asc' },
    });

    const now = Date.now();
    return active.map((o) => ({
      orderId: o.id,
      reference: o.reference,
      status: o.status as OrderStatus,
      driverId: o.driverId,
      driverName: o.driver?.user.fullName ?? null,
      dropoffLng: o.dropoffLng,
      dropoffLat: o.dropoffLat,
      etaSeconds: o.etaSeconds,
      scheduledFor: o.scheduledFor,
      ageSeconds: Math.round((now - o.createdAt.getTime()) / 1000),
    }));
  }
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
