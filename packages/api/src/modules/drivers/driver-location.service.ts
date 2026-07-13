import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  redisKeys,
  type DriverLocation,
  type LocationPing,
} from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { GeoService } from '../geo/geo.service';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * Ingests driver location pings. Server-side throttling protects Postgres:
 * every ping updates the hot Redis location + geo index (cheap) and fans out
 * over WebSocket to watchers of the active order, but only writes to the
 * PostGIS history table at most once per throttle window.
 */
@Injectable()
export class DriverLocationService {
  private readonly throttleMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly geo: GeoService,
    private readonly realtime: RealtimeService,
    config: ConfigService,
  ) {
    this.throttleMs = config.get<number>('driverLocationThrottleMs') ?? 5000;
  }

  async ingestPing(driverId: string, ping: LocationPing): Promise<void> {
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
    const orderId = ping.orderId ?? (await this.activeOrderId(driverId));
    if (orderId) this.realtime.emitDriverLocation(orderId, location);

    // 4. Persist to PostGIS history at most once per throttle window.
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
    }
  }

  async getHotLocation(driverId: string): Promise<DriverLocation | null> {
    return this.redis.get<DriverLocation>(redisKeys.driverLocation(driverId));
  }

  private async activeOrderId(driverId: string): Promise<string | null> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      select: { activeOrderId: true },
    });
    return profile?.activeOrderId ?? null;
  }
}
