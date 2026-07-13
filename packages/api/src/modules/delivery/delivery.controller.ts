import { Body, Controller, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  recordDeliveryFailureSchema,
  submitProofOfDeliverySchema,
  UserRole,
  type RecordDeliveryFailureInput,
  type SubmitProofOfDeliveryInput,
} from '@marhaba/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { DeliveryService } from './delivery.service';

@Controller('orders/:orderId/delivery')
@UseGuards(RolesGuard)
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post('failure')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN)
  recordFailure(
    @Param('orderId') orderId: string,
    @CurrentUser('id') userId: string,
    @Body(zodBody(recordDeliveryFailureSchema)) body: RecordDeliveryFailureInput,
  ) {
    return this.delivery.recordFailure(orderId, userId, body);
  }

  @Post('otp')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN)
  issueOtp(@Param('orderId') orderId: string) {
    return this.delivery.issueOtp(orderId);
  }

  @Post('pod/presign')
  @Roles(UserRole.DRIVER)
  presign(@Param('orderId') _orderId: string, @Query('kind') kind: 'pod' | 'signatures') {
    return this.delivery.presignPodUpload(kind === 'signatures' ? 'signatures' : 'pod');
  }

  @Post('pod')
  @Roles(UserRole.DRIVER)
  submitProof(
    @Param('orderId') orderId: string,
    @CurrentUser('id') userId: string,
    @Body(zodBody(submitProofOfDeliverySchema)) body: SubmitProofOfDeliveryInput,
  ) {
    return this.delivery.submitProof(orderId, userId, body);
  }
}
