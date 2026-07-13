import { Module } from '@nestjs/common';
import { DriverLocationService } from './driver-location.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

// RealtimeService is provided by the @Global RealtimeModule.
@Module({
  controllers: [DriversController],
  providers: [DriversService, DriverLocationService],
  exports: [DriversService, DriverLocationService],
})
export class DriversModule {}
