import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  controllers: [ZonesController],
  providers: [ZonesService, PricingService],
  exports: [ZonesService, PricingService],
})
export class ZonesModule {}
