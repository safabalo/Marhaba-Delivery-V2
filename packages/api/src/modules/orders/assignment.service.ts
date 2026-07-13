import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  AssignmentMode,
  GEO,
  OrderEventType,
  OrderStatus,
  type AssignOrderInput,
} from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GeoService } from '../geo/geo.service';
import { RealtimeService } from '../realtime/realtime.service';
import { OrderEventsService } from './order-events.service';

/**
 * Driver assignment. Supports explicit manual assignment and nearest-driver
 * auto-assignment (PostGIS distance on last-known driver locations). Moves the
 * order to ASSIGNED and marks the driver BUSY atomically.
 */
@Injectable()
export class AssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly events: OrderEventsService,
    private readonly realtime: RealtimeService,
  ) {}

  async assign(orderId: string, input: AssignOrderInput, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    const assignable: OrderStatus[] = [OrderStatus.ACCEPTED, OrderStatus.RETRY_SCHEDULED];
    if (!assignable.includes(order.status as OrderStatus)) {
      throw new BadRequestException(
        `Order must be ACCEPTED before assignment (current: ${order.status})`,
      );
    }

    let driverId = input.driverId ?? null;
    if (input.mode === AssignmentMode.AUTO_NEAREST || !driverId) {
      driverId = await this.pickNearestDriver(order.dropoffLng, order.dropoffLat);
      if (!driverId) throw new ConflictException('No available driver within range');
    }

    return this.commitAssignment(order.id, driverId, input.mode, actorId, order.driverId);
  }

  private async pickNearestDriver(lng: number, lat: number): Promise<string | null> {
    const candidates = await this.geo.nearestAvailableDrivers(
      lng,
      lat,
      GEO.NEAREST_DRIVER_RADIUS_KM,
      1,
    );
    return candidates[0]?.driverId ?? null;
  }

  private async commitAssignment(
    orderId: string,
    driverId: string,
    mode: AssignmentMode,
    actorId: string,
    previousDriverId: string | null,
  ) {
    const isReassign = !!previousDriverId && previousDriverId !== driverId;

    const result = await this.prisma.$transaction(async (tx) => {
      const driver = await tx.driverProfile.findUnique({ where: { id: driverId } });
      if (!driver) throw new NotFoundException('Driver not found');
      if (driver.activeOrderId && driver.activeOrderId !== orderId) {
        throw new ConflictException('Driver already has an active order');
      }

      // Release the previous driver, if any.
      if (previousDriverId && previousDriverId !== driverId) {
        await tx.driverProfile.update({
          where: { id: previousDriverId },
          data: { status: 'AVAILABLE', activeOrderId: null },
        });
      }

      const order = await tx.order.update({
        where: { id: orderId },
        data: { driverId, assignmentMode: mode, status: OrderStatus.ASSIGNED },
        include: { driver: { include: { user: { select: { fullName: true } } } } },
      });
      await tx.driverProfile.update({
        where: { id: driverId },
        data: { status: 'BUSY', activeOrderId: orderId },
      });
      await this.events.record({
        orderId,
        type: isReassign ? OrderEventType.REASSIGNED : OrderEventType.ASSIGNED,
        toStatus: OrderStatus.ASSIGNED,
        actorType: ActorType.DISPATCHER,
        actorId,
        metadata: { driverId, mode, previousDriverId },
        tx,
      });
      return order;
    });

    const driverName = result.driver?.user.fullName;
    this.realtime.emitOrderAssigned(orderId, driverId, driverName);
    this.realtime.emitOrderStatus(orderId, OrderStatus.ASSIGNED);
    return result;
  }

  /** Return an order to the pool (unassign). */
  async unassign(orderId: string, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order?.driverId) throw new BadRequestException('Order has no driver');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({
        where: { id: order.driverId! },
        data: { status: 'AVAILABLE', activeOrderId: null },
      });
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { driverId: null, status: OrderStatus.ACCEPTED, assignmentMode: null },
      });
      await this.events.record({
        orderId,
        type: OrderEventType.UNASSIGNED,
        fromStatus: order.status as OrderStatus,
        toStatus: OrderStatus.ACCEPTED,
        actorType: ActorType.DISPATCHER,
        actorId,
        metadata: { previousDriverId: order.driverId },
        tx,
      });
      return updated;
    });

    this.realtime.emitOrderStatus(orderId, OrderStatus.ACCEPTED);
    return result;
  }
}
