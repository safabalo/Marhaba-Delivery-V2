import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDeliveryZoneInput,
  CreatePricingRuleInput,
  UpdateDeliveryZoneInput,
  UpdatePricingRuleInput,
} from '@marhaba/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GeoService } from '../geo/geo.service';

@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  listZones() {
    return this.prisma.deliveryZone.findMany({
      include: { pricingRules: { where: { isActive: true } } },
      orderBy: { priority: 'desc' },
    });
  }

  async createZone(input: CreateDeliveryZoneInput) {
    const zone = await this.prisma.deliveryZone.create({
      data: {
        name: input.name,
        isActive: input.isActive,
        priority: input.priority,
        geojson: input.polygon as unknown as Prisma.InputJsonValue,
      },
    });
    await this.geo.syncZoneArea(zone.id, input.polygon);
    return zone;
  }

  async updateZone(id: string, input: UpdateDeliveryZoneInput) {
    await this.ensureZone(id);
    const zone = await this.prisma.deliveryZone.update({
      where: { id },
      data: {
        name: input.name,
        isActive: input.isActive,
        priority: input.priority,
        geojson: input.polygon
          ? (input.polygon as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
    if (input.polygon) await this.geo.syncZoneArea(id, input.polygon);
    return zone;
  }

  async deleteZone(id: string) {
    await this.ensureZone(id);
    return this.prisma.deliveryZone.update({ where: { id }, data: { isActive: false } });
  }

  // --- Pricing rules -------------------------------------------------------

  async createPricingRule(input: CreatePricingRuleInput) {
    await this.ensureZone(input.zoneId);
    return this.prisma.pricingRule.create({
      data: {
        zoneId: input.zoneId,
        baseFeeMinor: input.baseFeeMinor,
        perKmMinor: input.perKmMinor,
        minOrderMinor: input.minOrderMinor,
        freeDeliveryThresholdMinor: input.freeDeliveryThresholdMinor ?? null,
        surgeWindows: input.surgeWindows as unknown as Prisma.InputJsonValue,
        isActive: input.isActive,
      },
    });
  }

  async updatePricingRule(id: string, input: UpdatePricingRuleInput) {
    const existing = await this.prisma.pricingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pricing rule not found');
    return this.prisma.pricingRule.update({
      where: { id },
      data: {
        baseFeeMinor: input.baseFeeMinor,
        perKmMinor: input.perKmMinor,
        minOrderMinor: input.minOrderMinor,
        freeDeliveryThresholdMinor: input.freeDeliveryThresholdMinor,
        surgeWindows: input.surgeWindows
          ? (input.surgeWindows as unknown as Prisma.InputJsonValue)
          : undefined,
        isActive: input.isActive,
      },
    });
  }

  private async ensureZone(id: string) {
    const z = await this.prisma.deliveryZone.findUnique({ where: { id }, select: { id: true } });
    if (!z) throw new NotFoundException('Delivery zone not found');
  }
}
