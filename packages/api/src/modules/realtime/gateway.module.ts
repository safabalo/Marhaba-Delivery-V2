import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriversModule } from '../drivers/drivers.module';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Hosts the Socket.IO gateway. Kept separate from RealtimeModule so that
 * RealtimeService (used everywhere) has no dependency on the drivers module,
 * breaking what would otherwise be a cycle.
 */
@Module({
  imports: [AuthModule, DriversModule],
  providers: [RealtimeGateway],
})
export class GatewayModule {}
