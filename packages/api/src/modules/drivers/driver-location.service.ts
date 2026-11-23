import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  redisKeys,
  type DriverLocation,
  type GeoPoint,
  type LocationPing,
} from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EtaService } from '../eta/eta.service';
import { GeoService } from '../geo/geo.service';
import { RealtimeService } from '../realtime/realtime.service';

/** Order statuses during which the driver is heading to the pickup. */
const HEADING_TO_PICKUP: OrderStatus[] = [
  OrderStatus.ACCEPTED,
  OrderStatus.ASSIGNED,
  OrderStatus.EN_ROUTE_TO_PICKUP,
];
/** Order statuses during which the driver is heading to the dropoff. */
const HEADING_TO_DROPOFF: OrderStatus[] = [
  OrderStatus.PICKED_UP,
  OrderStatus.OUT_FOR_DELIVERY,
];

/**
 * Ingests driver location pings. Server-side throttling protects Postgres:
 * every ping updates the hot Redis location + geo index (cheap) and fans out
 * over WebSocket to watchers of the active order, but only writes to the
 * PostGIS history table — and recomputes the routing ETA — at most once per
 * throttle window.
 *
 * Callers pass the authenticated user id; the driver's profile id (the id
 * carried on orders and the geo index) is resolved here.
 */
@Injectable()
export class DriverLocationService {
  private readonly throttleMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly geo: GeoService,
    private readonly realtime: RealtimeService,
    private readonly eta: EtaService,
    config: ConfigService,
  ) {
    this.throttleMs = config.get<number>('driverLocationThrottleMs') ?? 5000;
  }

  async ingestPing(userId: string, ping: LocationPing): Promise<void> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
      select: { id: true, activeOrderId: true },
    });
    if (!profile) return;
    const driverId = profile.id;

    const location: DriverLocation = {
      driverId,
      lng: ping.lng,
      lat: ping.lat,
      headingDeg: ping.headingDeg ?? null,
      speedMps: ping.speedMps ?? null,
      recordedAt: ping.recordedAt,
    };

    // 1. Hot cache + geo index (always).
    await this.redis.setDriverLocation(
      redisKeys.driverGeoIndex,
      redisKeys.driverLocation(driverId),
      driverId,
      ping.lng,
      ping.lat,
      location,
    );

    // 2. Mirror last-known onto the driver row (drives PostGIS nearest queries).
    await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { lastLng: ping.lng, lastLat: ping.lat, lastSeenAt: new Date() },
    });

    // 3. Fan out to anyone watching the active order.
    const orderId = ping.orderId ?? profile.activeOrderId;
    if (orderId) this.realtime.emitDriverLocation(orderId, location);

    // 4. Throttled work: PostGIS history + ETA recompute (at most once/window).
    const throttleKey = `${redisKeys.driverLocation(driverId)}:hist`;
    const shouldPersist = await this.redis.setNx(
      throttleKey,
      '1',
      Math.ceil(this.throttleMs / 1000),
    );
    if (shouldPersist) {
      await this.geo.recordDriverLocation({
        driverId,
        orderId: orderId ?? null,
        lng: ping.lng,
        lat: ping.lat,
        headingDeg: ping.headingDeg ?? null,
        speedMps: ping.speedMps ?? null,
        recordedAt: ping.recordedAt,
      });
      if (orderId) await this.refreshEta(orderId, { lng: ping.lng, lat: ping.lat });
    }
  }

  async getHotLocation(driverId: string): Promise<DriverLocation | null> {
    return this.redis.get<DriverLocation>(redisKeys.driverLocation(driverId));
  }

  /**
   * Recompute the driver→next-waypoint ETA (pickup before pickup, dropoff
   * after), persist it on the order, and broadcast it. Best-effort: routing or
   * DB hiccups never break location ingest.
   */
  private async refreshEta(orderId: string, driver: GeoPoint): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, pickupAddress: true, dropoffLng: true, dropoffLat: true },
      });
      if (!order) return;
      const status = order.status as OrderStatus;

      let target: GeoPoint | null = null;
      if (HEADING_TO_PICKUP.includes(status)) {
        const pickup = order.pickupAddress as { point?: GeoPoint } | null;
        target = pickup?.point ?? null;
      } else if (HEADING_TO_DROPOFF.includes(status)) {
        target = { lng: order.dropoffLng, lat: order.dropoffLat };
      }
      if (!target) return;

      const seconds = await this.eta.estimateSeconds(driver, target);
      await this.prisma.order.update({ where: { id: orderId }, data: { etaSeconds: seconds } });
      this.realtime.emitEta(orderId, seconds);
    } catch {
      // ETA is advisory; swallow errors so ping ingest always succeeds.
    }
  }
}
