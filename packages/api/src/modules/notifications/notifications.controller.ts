import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  markNotificationsReadSchema,
  registerPushTokenSchema,
  type MarkNotificationsReadInput,
  type RegisterPushTokenInput,
} from '@marhaba/shared';
import { CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.notifications.listForUser(userId);
  }

  @Post('push-token')
  registerToken(
    @CurrentUser('id') userId: string,
    @Body(zodBody(registerPushTokenSchema)) body: RegisterPushTokenInput,
  ) {
    return this.notifications.registerPushToken(userId, body);
  }

  @Patch('read')
  markRead(
    @CurrentUser('id') userId: string,
    @Body(zodBody(markNotificationsReadSchema)) body: MarkNotificationsReadInput,
  ) {
    return this.notifications.markRead(userId, body);
  }
}
