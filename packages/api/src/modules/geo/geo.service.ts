import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * PostGIS-backed spatial queries. Prisma cannot express geography columns, so
 * these go through parameterised raw SQL. The `area` / `geom` columns are
 * maintained by SQL migrations and kept in sync on writes (see ZonesService).
 */
@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the delivery zone containing a point, honouring zone priority when
   * polygons overlap. Returns the zone id or null.
   */
  async findZoneForPoint(lng: number, lat: number): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM delivery_zones
      WHERE "isActive" = true
        AND area IS NOT NULL
        AND ST_Covers(area, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)
      ORDER BY priority DESC
      LIMIT 1
    `;
    return rows[0]?.id ?? null;
  }

  /** Straight-line distance (metres) between two points, via PostGIS. */
  async distanceMeters(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ meters: number }[]>`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${fromLng}, ${fromLat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${toLng}, ${toLat}), 4326)::geography
      ) AS meters
    `;
    return rows[0]?.meters ?? 0;
  }

  /** Append a driver location ping to the PostGIS history table. */
  async recordDriverLocation(params: {
    driverId: string;
    orderId?: string | null;
    lng: number;
    lat: number;
    headingDeg?: number | null;
    speedMps?: number | null;
    recordedAt: Date;
  }): Promise<void> {
    const { driverId, orderId = null, lng, lat, headingDeg = null, speedMps = null, recordedAt } =
      params;
    await this.prisma.$executeRaw`
      INSERT INTO driver_location_history
        (id, "driverId", "orderId", lng, lat, geom, "headingDeg", "speedMps", "recordedAt")
      VALUES (
        gen_random_uuid()::text, ${driverId}, ${orderId}, ${lng}, ${lat},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${headingDeg}, ${speedMps}, ${recordedAt}
      )
    `;
  }

  /** Nearest available drivers to a point using PostGIS on last-known location. */
  async nearestAvailableDrivers(
    lng: number,
    lat: number,
    radiusKm: number,
    limit: number,
  ): Promise<Array<{ driverId: string; distanceMeters: number }>> {
    const radiusM = radiusKm * 1000;
    return this.prisma.$queryRaw<Array<{ driverId: string; distanceMeters: number }>>`
      SELECT dp.id AS "driverId",
             ST_Distance(
               ST_SetSRID(ST_MakePoint(dp."lastLng", dp."lastLat"), 4326)::geography,
               ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
             ) AS "distanceMeters"
      FROM driver_profiles dp
      WHERE dp.status = 'AVAILABLE'
        AND dp."activeOrderId" IS NULL
        AND dp."lastLng" IS NOT NULL
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(dp."lastLng", dp."lastLat"), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusM}
        )
      ORDER BY "distanceMeters" ASC
      LIMIT ${limit}
    `;
  }

  /** Sync the PostGIS `area` polygon from a zone's GeoJSON after a write. */
  async syncZoneArea(zoneId: string, geojson: unknown): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE delivery_zones
      SET area = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geojson)}), 4326)::geography
      WHERE id = ${zoneId}
    `;
  }
}
