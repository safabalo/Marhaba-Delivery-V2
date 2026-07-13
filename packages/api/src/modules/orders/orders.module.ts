import { Module } from '@nestjs/common';
import { ZonesModule } from '../zones/zones.module';
import { AssignmentService } from './assignment.service';
import { OrderEventsService } from './order-events.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [ZonesModule],
  controllers: [OrdersController],
  providers: [OrdersService, AssignmentService, OrderEventsService],
  exports: [OrdersService, AssignmentService, OrderEventsService],
})
export class OrdersModule {}
