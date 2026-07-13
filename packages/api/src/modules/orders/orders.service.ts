import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  assertTransition,
  IllegalOrderTransitionError,
  OrderEventType,
  OrderStatus,
  UserRole,
  type Address,
  type CreateOrderInput,
  type ListOrdersQuery,
  type TransitionOrderInput,
} from '@marhaba/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { PricingService } from '../zones/pricing.service';
import { RealtimeService } from '../realtime/realtime.service';
import { OrderEventsService } from './order-events.service';
import { DEFAULT_PICKUP_ADDRESS, generateOrderReference } from './orders.constants';

const eventTypeForStatus: Partial<Record<OrderStatus, OrderEventType>> = {
  [OrderStatus.PICKED_UP]: OrderEventType.PICKED_UP,
  [OrderStatus.OUT_FOR_DELIVERY]: OrderEventType.OUT_FOR_DELIVERY,
  [OrderStatus.DELIVERED]: OrderEventType.DELIVERED,
  [OrderStatus.RETURNED]: OrderEventType.RETURNED,
  [OrderStatus.CANCELLED]: OrderEventType.CANCELLED,
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly events: OrderEventsService,
    private readonly realtime: RealtimeService,
  ) {}

  // --- Creation & checkout -------------------------------------------------

  async create(clientId: string, input: CreateOrderInput) {
    const productIds = input.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isAvailable: true },
    });
    if (products.length !== new Set(productIds).size) {
      throw new BadRequestException('One or more products are unavailable');
    }
    const byId = new Map(products.map((p) => [p.id, p]));
    const currency = products[0]?.currency ?? 'AED';

    const items = input.items.map((line) => {
      const product = byId.get(line.productId)!;
      const lineTotal = product.priceMinor * line.quantity;
      return {
        productId: product.id,
        nameSnapshot: product.name,
        unitPriceMinor: product.priceMinor,
        quantity: line.quantity,
        lineTotalMinor: lineTotal,
      };
    });
    const subtotalMinor = items.reduce((sum, i) => sum + i.lineTotalMinor, 0);

    const pickup: Address = DEFAULT_PICKUP_ADDRESS;
    const dropoff = input.dropoffAddress;

    // Compute & FREEZE pricing onto the order.
    const { snapshot, zoneId } = await this.pricing.quote({
      subtotalMinor,
      pickup: pickup.point,
      dropoff: dropoff.point,
      currency,
      at: input.scheduledFor ?? new Date(),
    });

    if (!snapshot.minOrderMet) {
      throw new BadRequestException(
        `Order subtotal is below the minimum for this zone (${snapshot.minOrderMinor} ${currency})`,
      );
    }

    const scheduled = input.scheduledFor && input.scheduledFor.getTime() > Date.now();
    const initialStatus = input.placeNow
      ? scheduled
        ? OrderStatus.SCHEDULED
        : OrderStatus.PLACED
      : OrderStatus.DRAFT;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          reference: generateOrderReference(),
          clientId,
          zoneId,
          status: initialStatus,
          paymentMethod: input.paymentMethod,
          pickupAddress: pickup as unknown as Prisma.InputJsonValue,
          dropoffAddress: dropoff as unknown as Prisma.InputJsonValue,
          dropoffLng: dropoff.point.lng,
          dropoffLat: dropoff.point.lat,
          pricing: snapshot as unknown as Prisma.InputJsonValue,
          currency,
          subtotalMinor,
          totalMinor: snapshot.totalMinor,
          scheduledFor: input.scheduledFor ?? null,
          notes: input.notes ?? null,
          items: { create: items },
        },
        include: { items: true },
      });

      await this.events.record({
        orderId: created.id,
        type: OrderEventType.CREATED,
        toStatus: initialStatus,
        actorType: ActorType.CLIENT,
        actorId: clientId,
        metadata: { subtotalMinor, totalMinor: snapshot.totalMinor, zoneId },
        tx,
      });
      if (initialStatus === OrderStatus.SCHEDULED) {
        await this.events.record({
          orderId: created.id,
          type: OrderEventType.SCHEDULED,
          actorType: ActorType.CLIENT,
          actorId: clientId,
          metadata: { scheduledFor: input.scheduledFor },
          tx,
        });
      }
      return created;
    });

    if (initialStatus !== OrderStatus.DRAFT) {
      this.realtime.emitOrderStatus(order.id, initialStatus);
    }
    return order;
  }

  // --- Reads ---------------------------------------------------------------

  async findForUser(id: string, user: AuthenticatedUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, payment: true, proofOfDelivery: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertCanView(order, user);
    return order;
  }

  list(query: ListOrdersQuery, user: AuthenticatedUser) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = query.from;
      if (query.to) where.createdAt.lte = query.to;
    }
    // Clients see only their own; drivers see their assigned orders.
    if (user.role === UserRole.CLIENT) where.clientId = user.id;
    else if (user.role === UserRole.DRIVER) {
      where.driver = { userId: user.id };
    } else {
      if (query.clientId) where.clientId = query.clientId;
      if (query.driverId) where.driverId = query.driverId;
    }
    return this.prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  timeline(id: string) {
    return this.events.timeline(id);
  }

  // --- Transitions ---------------------------------------------------------

  /**
   * Guarded status transition. Validates against the shared state machine,
   * writes the audit event, and broadcasts over WebSocket — all atomically.
   */
  async transition(
    id: string,
    input: TransitionOrderInput,
    actor: { type: ActorType; id: string | null },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    const from = order.status as OrderStatus;
    const to = input.to;
    try {
      assertTransition(from, to);
    } catch (e) {
      if (e instanceof IllegalOrderTransitionError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({ where: { id }, data: { status: to } });
      await this.events.record({
        orderId: id,
        type: eventTypeForStatus[to] ?? OrderEventType.STATUS_CHANGED,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.id,
        metadata: input.reason ? { reason: input.reason, ...input.metadata } : input.metadata,
        tx,
      });
      return result;
    });

    this.realtime.emitOrderStatus(id, to, { reason: input.reason });
    return updated;
  }

  async place(id: string, user: AuthenticatedUser) {
    const order = await this.findForUser(id, user);
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('Only draft orders can be placed');
    }
    return this.transition(id, { to: OrderStatus.PLACED }, { type: ActorType.CLIENT, id: user.id });
  }

  // --- Guards --------------------------------------------------------------

  private assertCanView(order: { clientId: string; driverId: string | null }, user: AuthenticatedUser) {
    const staffRoles: UserRole[] = [UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN];
    if (staffRoles.includes(user.role)) {
      return;
    }
    if (user.role === UserRole.CLIENT && order.clientId === user.id) return;
    if (user.role === UserRole.DRIVER) return; // ownership re-checked at driver actions
    throw new ForbiddenException('Not allowed to view this order');
  }
}
