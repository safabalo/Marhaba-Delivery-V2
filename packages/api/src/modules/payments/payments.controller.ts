import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  confirmCashPaymentSchema,
  createPaymentIntentSchema,
  HTTP_HEADER,
  UserRole,
  type ConfirmCashPaymentInput,
  type CreatePaymentIntentInput,
} from '@marhaba/shared';
import type { Request } from 'express';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

@Controller('payments')
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
  ) {}

  @Post('intent')
  @Roles(UserRole.CLIENT)
  @UseInterceptors(IdempotencyInterceptor)
  createIntent(
    @CurrentUser('id') userId: string,
    @Body(zodBody(createPaymentIntentSchema)) body: CreatePaymentIntentInput,
  ) {
    return this.payments.createPaymentIntent(body.orderId, userId);
  }

  @Post('cash/:orderId/confirm')
  @Roles(UserRole.DRIVER)
  confirmCash(
    @Param('orderId') orderId: string,
    @Body(zodBody(confirmCashPaymentSchema)) body: ConfirmCashPaymentInput,
  ) {
    return this.payments.confirmCash(orderId, body.collectedMinor);
  }

  /**
   * Stripe webhook. Public (Stripe has no JWT) but every request is verified
   * with the endpoint's signing secret against the RAW request body.
   */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers(HTTP_HEADER.STRIPE_SIGNATURE) signature: string,
  ) {
    if (!signature || !req.rawBody) throw new BadRequestException('Missing signature or body');
    let event;
    try {
      event = this.stripe.constructEvent(req.rawBody, signature);
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
    }
    return this.payments.handleWebhookEvent(event as never);
  }
}
