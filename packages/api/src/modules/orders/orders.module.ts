import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { ZonesModule } from '../zones/zones.module';
import { AssignmentService } from './assignment.service';
import { OrderEventsService } from './order-events.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TrackingService } from './tracking.service';

@Module({
  imports: [ZonesModule, DriversModule],
  controllers: [OrdersController],
  providers: [OrdersService, AssignmentService, OrderEventsService, TrackingService],
  exports: [OrdersService, AssignmentService, OrderEventsService],
})
export class OrdersModule {}
