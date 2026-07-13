import { z } from 'zod';
import { NotificationChannel, NotificationStatus } from '../enums.js';

export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  channel: z.nativeEnum(NotificationChannel),
  status: z.nativeEnum(NotificationStatus),
  title: z.string(),
  body: z.string(),
  data: z.record(z.unknown()).nullable(),
  orderId: z.string().nullable(),
  createdAt: z.coerce.date(),
  readAt: z.coerce.date().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** Internal request to fan a notification out across channels. */
export const sendNotificationSchema = z.object({
  userId: z.string().min(1),
  channels: z.array(z.nativeEnum(NotificationChannel)).min(1),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(1000),
  data: z.record(z.unknown()).optional(),
  orderId: z.string().optional(),
});
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;

/** Register/refresh a device push token for the current user. */
export const registerPushTokenSchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.enum(['ios', 'android', 'web']),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const markNotificationsReadSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;
