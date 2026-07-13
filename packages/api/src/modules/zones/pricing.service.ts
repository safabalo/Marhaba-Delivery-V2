import { Injectable } from '@nestjs/common';
import {
  computePricing,
  type PricingSnapshot,
  type SurgeWindow,
} from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GeoService } from '../geo/geo.service';

/**
 * Resolves the applicable zone + pricing rule for a dropoff and computes the
 * pricing snapshot that gets FROZEN onto the order at checkout.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  async quote(params: {
    subtotalMinor: number;
    pickup: { lng: number; lat: number };
    dropoff: { lng: number; lat: number };
    currency: string;
    at?: Date;
  }): Promise<{ snapshot: PricingSnapshot; zoneId: string | null }> {
    const zoneId = await this.geo.findZoneForPoint(params.dropoff.lng, params.dropoff.lat);

    const rule = zoneId
      ? await this.prisma.pricingRule.findFirst({
          where: { zoneId, isActive: true },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const meters = await this.geo.distanceMeters(
      params.pickup.lng,
      params.pickup.lat,
      params.dropoff.lng,
      params.dropoff.lat,
    );
    const distanceKm = meters / 1000;

    const snapshot = computePricing({
      rule: rule
        ? {
            id: rule.id,
            zoneId: rule.zoneId,
            baseFeeMinor: rule.baseFeeMinor,
            perKmMinor: rule.perKmMinor,
            minOrderMinor: rule.minOrderMinor,
            freeDeliveryThresholdMinor: rule.freeDeliveryThresholdMinor,
            surgeWindows: (rule.surgeWindows as unknown as SurgeWindow[]) ?? [],
          }
        : null,
      subtotalMinor: params.subtotalMinor,
      distanceKm,
      currency: params.currency,
      at: params.at,
    });

    return { snapshot, zoneId };
  }
}
