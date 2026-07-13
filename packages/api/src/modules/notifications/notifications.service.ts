import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  type MarkNotificationsReadInput,
  type RegisterPushTokenInput,
  type SendNotificationInput,
} from '@marhaba/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Multi-channel notifications. Each requested channel is persisted and
 * dispatched through its provider adapter (FCM / Twilio / email). Providers are
 * pluggable and no-op when unconfigured, so the notification record + in-app
 * feed always work in development.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(input: SendNotificationInput) {
    const created = await Promise.all(
      input.channels.map((channel) =>
        this.prisma.notification.create({
          data: {
            userId: input.userId,
            channel,
            status: NotificationStatus.QUEUED,
            title: input.title,
            body: input.body,
            data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
            orderId: input.orderId ?? null,
          },
        }),
      ),
    );

    // Dispatch out-of-band; failures downgrade status but never block the call.
    await Promise.all(created.map((n) => this.dispatch(n.id, n.channel, input)));
    return created;
  }

  private async dispatch(
    notificationId: string,
    channel: NotificationChannel,
    input: SendNotificationInput,
  ): Promise<void> {
    try {
      switch (channel) {
        case NotificationChannel.PUSH:
          await this.sendPush(input);
          break;
        case NotificationChannel.SMS:
          await this.sendSms(input);
          break;
        case NotificationChannel.EMAIL:
          await this.sendEmail(input);
          break;
        case NotificationChannel.IN_APP:
          break; // delivered by persistence alone
      }
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.SENT },
      });
    } catch (err) {
      this.logger.warn(`Notification ${notificationId} (${channel}) failed: ${(err as Error).message}`);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.FAILED },
      });
    }
  }

  // Provider adapters — wire real SDKs here. No-op when unconfigured.
  private async sendPush(_input: SendNotificationInput): Promise<void> {
    // TODO: firebase-admin messaging.send() to each of the user's PushTokens.
  }
  private async sendSms(_input: SendNotificationInput): Promise<void> {
    // TODO: Twilio messages.create().
  }
  private async sendEmail(_input: SendNotificationInput): Promise<void> {
    // TODO: SMTP / provider send.
  }

  registerPushToken(userId: string, input: RegisterPushTokenInput) {
    return this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: { userId, token: input.token, platform: input.platform },
      update: { userId, platform: input.platform },
    });
  }

  listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  markRead(userId: string, input: MarkNotificationsReadInput) {
    return this.prisma.notification.updateMany({
      where: { userId, id: { in: input.ids } },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }
}
