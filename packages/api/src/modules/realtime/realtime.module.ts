import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

/**
 * Global so any module can push real-time updates via RealtimeService without
 * importing the gateway (which lives in GatewayModule to avoid dependency
 * cycles). The gateway registers the live Socket.IO server on this service.
 */
@Global()
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
