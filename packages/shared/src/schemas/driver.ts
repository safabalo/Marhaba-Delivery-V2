import { z } from 'zod';
import { OrderStatus } from '../enums.js';

/**
 * A single driver location ping. Sent over WebSocket (throttled client-side)
 * and by the offline outbox. Stored hot in Redis and appended to PostGIS
 * history.
 */
export const locationPingSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  headingDeg: z.number().min(0).max(360).optional(),
  speedMps: z.number().nonnegative().optional(),
  accuracyM: z.number().nonnegative().optional(),
  // Client capture time — the outbox replays with the original timestamp.
  recordedAt: z.coerce.date().default(() => new Date()),
  orderId: z.string().optional(),
});
export type LocationPing = z.infer<typeof locationPingSchema>;

export const driverLocationSchema = z.object({
  driverId: z.string(),
  lng: z.number(),
  lat: z.number(),
  headingDeg: z.number().nullable(),
  speedMps: z.number().nullable(),
  recordedAt: z.coerce.date(),
});
export type DriverLocation = z.infer<typeof driverLocationSchema>;

export const nearestDriverQuerySchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  radiusKm: z.number().min(0.1).max(50).default(15),
  limit: z.number().int().min(1).max(20).default(5),
});
export type NearestDriverQuery = z.infer<typeof nearestDriverQuerySchema>;

/**
 * Driver performance analytics derived from the OrderEvent audit trail.
 */
export const driverPerformanceSchema = z.object({
  driverId: z.string(),
  windowFrom: z.coerce.date(),
  windowTo: z.coerce.date(),
  deliveriesCompleted: z.number().int(),
  deliveriesFailed: z.number().int(),
  successRate: z.number().min(0).max(1),
  avgAcceptSeconds: z.number().nullable(),
  avgPickupSeconds: z.number().nullable(),
  avgDeliverySeconds: z.number().nullable(),
  onTimeRate: z.number().min(0).max(1).nullable(),
  ratingAvg: z.number().min(0).max(5).nullable(),
});
export type DriverPerformance = z.infer<typeof driverPerformanceSchema>;

/** One row on the dispatcher live board. */
export const dispatchBoardOrderSchema = z.object({
  orderId: z.string(),
  reference: z.string(),
  status: z.nativeEnum(OrderStatus),
  driverId: z.string().nullable(),
  driverName: z.string().nullable(),
  dropoffLng: z.number(),
  dropoffLat: z.number(),
  etaSeconds: z.number().int().nullable(),
  scheduledFor: z.coerce.date().nullable(),
  ageSeconds: z.number().int(),
});
export type DispatchBoardOrder = z.infer<typeof dispatchBoardOrderSchema>;
