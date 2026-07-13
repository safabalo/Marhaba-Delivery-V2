import { Global, Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { SchedulerService } from './scheduler.service';

@Global()
@Module({
  imports: [OrdersModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
