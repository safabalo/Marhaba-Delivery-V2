import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import {
  nearestDriverQuerySchema,
  updateDriverStatusSchema,
  UserRole,
  type NearestDriverQuery,
  type UpdateDriverStatusInput,
} from '@marhaba/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { DriversService } from './drivers.service';

@Controller('drivers')
@UseGuards(RolesGuard)
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

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
