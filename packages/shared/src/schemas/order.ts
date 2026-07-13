import { z } from 'zod';
import {
  ActorType,
  AssignmentMode,
  DeliveryFailureReason,
  OrderEventType,
  OrderStatus,
  PaymentMethod,
} from '../enums.js';
import { addressSchema, currencySchema, moneyMinorSchema } from './common.js';
import { pricingSnapshotSchema } from './pricing.js';

export const orderItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  nameSnapshot: z.string(),
  unitPriceMinor: moneyMinorSchema,
  quantity: z.number().int().min(1),
  lineTotalMinor: moneyMinorSchema,
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderEventSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  type: z.nativeEnum(OrderEventType),
  fromStatus: z.nativeEnum(OrderStatus).nullable(),
  toStatus: z.nativeEnum(OrderStatus).nullable(),
  actorType: z.nativeEnum(ActorType),
  actorId: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});
export type OrderEvent = z.infer<typeof orderEventSchema>;

export const orderSchema = z.object({
  id: z.string(),
  reference: z.string(),
  clientId: z.string(),
  driverId: z.string().nullable(),
  status: z.nativeEnum(OrderStatus),
  paymentMethod: z.nativeEnum(PaymentMethod),
  assignmentMode: z.nativeEnum(AssignmentMode).nullable(),
  pickupAddress: addressSchema,
  dropoffAddress: addressSchema,
  items: z.array(orderItemSchema),
  pricing: pricingSnapshotSchema,
  currency: currencySchema,
  scheduledFor: z.coerce.date().nullable(),
  etaSeconds: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Order = z.infer<typeof orderSchema>;

// --- Inputs ----------------------------------------------------------------

export const createOrderItemInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

/** Create a DRAFT/PLACED order. Pricing is computed & frozen server-side. */
export const createOrderSchema = z.object({
  items: z.array(createOrderItemInputSchema).min(1),
  dropoffAddress: addressSchema,
  paymentMethod: z.nativeEnum(PaymentMethod),
  scheduledFor: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  // If true the order is PLACED immediately; otherwise left as DRAFT.
  placeNow: z.boolean().default(true),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const listOrdersQuerySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  clientId: z.string().optional(),
  driverId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

/** Generic status transition (guarded server-side by the state machine). */
export const transitionOrderSchema = z.object({
  to: z.nativeEnum(OrderStatus),
  reason: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>;

export const assignOrderSchema = z.object({
  driverId: z.string().min(1).optional(),
  mode: z.nativeEnum(AssignmentMode).default(AssignmentMode.MANUAL),
});
export type AssignOrderInput = z.infer<typeof assignOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// --- Failed delivery workflow ---------------------------------------------

export const deliveryAttemptSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  attemptNumber: z.number().int().min(1),
  succeeded: z.boolean(),
  failureReason: z.nativeEnum(DeliveryFailureReason).nullable(),
  notes: z.string().nullable(),
  lng: z.number().nullable(),
  lat: z.number().nullable(),
  createdAt: z.coerce.date(),
});
export type DeliveryAttempt = z.infer<typeof deliveryAttemptSchema>;

export const recordDeliveryFailureSchema = z.object({
  reason: z.nativeEnum(DeliveryFailureReason),
  notes: z.string().max(500).optional(),
  lng: z.number().min(-180).max(180).optional(),
  lat: z.number().min(-90).max(90).optional(),
  // What to do next.
  resolution: z.enum(['RETRY', 'RESCHEDULE', 'RETURN']),
  rescheduleFor: z.coerce.date().optional(),
});
export type RecordDeliveryFailureInput = z.infer<typeof recordDeliveryFailureSchema>;

// --- Proof of delivery -----------------------------------------------------

export const proofOfDeliverySchema = z.object({
  id: z.string(),
  orderId: z.string(),
  type: z.enum(['PHOTO', 'OTP_CODE', 'SIGNATURE']),
  photoUrl: z.string().url().nullable(),
  signatureUrl: z.string().url().nullable(),
  otpVerified: z.boolean().nullable(),
  lng: z.number().nullable(),
  lat: z.number().nullable(),
  capturedAt: z.coerce.date(),
});
export type ProofOfDelivery = z.infer<typeof proofOfDeliverySchema>;

export const submitProofOfDeliverySchema = z
  .object({
    type: z.enum(['PHOTO', 'OTP_CODE', 'SIGNATURE']),
    // For PHOTO/SIGNATURE the client first uploads and passes the object key.
    photoKey: z.string().optional(),
    signatureKey: z.string().optional(),
    otpCode: z.string().length(6).optional(),
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
    capturedAt: z.coerce.date().default(() => new Date()),
  })
  .refine(
    (v) =>
      (v.type === 'PHOTO' && !!v.photoKey) ||
      (v.type === 'SIGNATURE' && !!v.signatureKey) ||
      (v.type === 'OTP_CODE' && !!v.otpCode),
    { message: 'Proof payload must match the selected proof type' },
  );
export type SubmitProofOfDeliveryInput = z.infer<typeof submitProofOfDeliverySchema>;
