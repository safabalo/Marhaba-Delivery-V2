import { Injectable, NotFoundException } from '@nestjs/common';
import { type DriverStatus, type NearestDriverQuery } from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GeoService } from '../geo/geo.service';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  async getProfileByUserId(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Driver profile not found');
    return profile;
  }

  async setStatus(userId: string, status: DriverStatus) {
    const profile = await this.getProfileByUserId(userId);
    return this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: { status },
    });
  }

  nearest(query: NearestDriverQuery) {
    return this.geo.nearestAvailableDrivers(
      query.lng,
      query.lat,
      query.radiusKm,
      query.limit,
    );
  }

  listActive() {
    return this.prisma.driverProfile.findMany({
      where: { status: { in: ['AVAILABLE', 'BUSY'] } },
      include: { user: { select: { fullName: true, phone: true } } },
    });
  }
}
