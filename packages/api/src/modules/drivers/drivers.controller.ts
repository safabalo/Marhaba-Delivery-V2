import { Body, Controller, Get, HttpCode, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  locationPingSchema,
  nearestDriverQuerySchema,
  updateDriverStatusSchema,
  UserRole,
  type LocationPing,
  type NearestDriverQuery,
  type UpdateDriverStatusInput,
} from '@marhaba/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { DriverLocationService } from './driver-location.service';
import { DriversService } from './drivers.service';

@Controller('drivers')
@UseGuards(RolesGuard)
export class DriversController {
  constructor(
    private readonly drivers: DriversService,
    private readonly driverLocation: DriverLocationService,
  ) {}

  @Get('me')
  @Roles(UserRole.DRIVER)
  me(@CurrentUser('id') userId: string) {
    return this.drivers.getProfileByUserId(userId);
  }

  @Patch('me/status')
  @Roles(UserRole.DRIVER)
  setStatus(
    @CurrentUser('id') userId: string,
    @Body(zodBody(updateDriverStatusSchema)) body: UpdateDriverStatusInput,
  ) {
    return this.drivers.setStatus(userId, body.status);
  }

  /**
   * HTTP fallback for a location ping. The driver app streams pings over the
   * WebSocket while connected and replays any it missed through the offline
   * outbox to this endpoint. Idempotent enough to replay safely.
   */
  @Post('me/location')
  @Roles(UserRole.DRIVER)
  @HttpCode(202)
  async recordLocation(
    @CurrentUser('id') userId: string,
    @Body(zodBody(locationPingSchema)) body: LocationPing,
  ) {
    await this.driverLocation.ingestPing(userId, body);
    return { accepted: true };
  }

  @Get('nearest')
  @Roles(UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN)
  nearest(@Query(zodBody(nearestDriverQuerySchema)) query: NearestDriverQuery) {
    return this.drivers.nearest(query);
  }

  @Get('active')
  @Roles(UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN)
  active() {
    return this.drivers.listActive();
  }
}
