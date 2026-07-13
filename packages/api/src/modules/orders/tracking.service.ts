import { Injectable } from '@nestjs/common';
import {
  isTerminal,
  OrderStatus,
  type GeoPoint,
  type LocationHistoryPoint,
  type OrderTracking,
} from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { DriverLocationService } from '../drivers/driver-location.service';
import { EtaService } from '../eta/eta.service';
import { OrdersService } from './orders.service';

/**
 * Live tracking read model for an order: current driver position, routing ETA,
 * waypoints and (when available) a route polyline. Authorization is delegated
 * to OrdersService.findForUser so clients only ever see their own orders.
 */
@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly driverLocation: DriverLocationService,
    private readonly eta: EtaService,
  ) {}

  async getTracking(orderId: string, user: AuthenticatedUser): Promise<OrderTracking> {
    const order = await this.orders.findForUser(orderId, user);
    const status = order.status as OrderStatus;

    const pickup = (order.pickupAddress as { point: GeoPoint }).point;
    const dropoff: GeoPoint = { lng: order.dropoffLng, lat: order.dropoffLat };

    const driver = order.driverId
      ? await this.driverLocation.getHotLocation(order.driverId)
      : null;

    // Draw the remaining leg: driver → next waypoint, else pickup → dropoff.
    let routeGeometry: [number, number][] | null = null;
    if (!isTerminal(status)) {
      const from = driver ? { lng: driver.lng, lat: driver.lat } : pickup;
      const to =
        status === OrderStatus.PICKED_UP || status === OrderStatus.OUT_FOR_DELIVERY
          ? dropoff
          : pickup;
      routeGeometry = (await this.eta.route(from, to)).geometry;
    }

    return {
      orderId: order.id,
      status,
      etaSeconds: order.etaSeconds,
      pickup,
      dropoff,
      driver,
      routeGeometry,
    };
  }

  async getLocationHistory(orderId: string): Promise<LocationHistoryPoint[]> {
    const rows = await this.prisma.driverLocationHistory.findMany({
      where: { orderId },
      orderBy: { recordedAt: 'asc' },
      select: { lng: true, lat: true, headingDeg: true, speedMps: true, recordedAt: true },
      take: 1000,
    });
    return rows;
  }
}
