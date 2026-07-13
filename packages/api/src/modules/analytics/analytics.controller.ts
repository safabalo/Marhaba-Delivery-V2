import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@marhaba/shared';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AnalyticsService } from './analytics.service';

@Controller()
@UseGuards(RolesGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dispatch/board')
  @Roles(UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN)
  board() {
    return this.analytics.dispatchBoard();
  }

  @Get('analytics/drivers/:driverId/performance')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  driverPerformance(
    @Param('driverId') driverId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();
    return this.analytics.driverPerformance(driverId, fromDate, toDate);
  }
}
