import { z } from 'zod';
import { PaymentMethod, PaymentStatus } from '../enums.js';
import { currencySchema, moneyMinorSchema } from './common.js';

export const paymentSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  method: z.nativeEnum(PaymentMethod),
  status: z.nativeEnum(PaymentStatus),
  amountMinor: moneyMinorSchema,
  currency: currencySchema,
  stripePaymentIntentId: z.string().nullable(),
  refundedMinor: moneyMinorSchema,
  createdAt: z.coerce.date(),
});
export type Payment = z.infer<typeof paymentSchema>;

/** Create a PaymentIntent for an order (card) — idempotent. */
export const createPaymentIntentSchema = z.object({
  orderId: z.string().min(1),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const paymentIntentResponseSchema = z.object({
  paymentId: z.string(),
  clientSecret: z.string().nullable(),
  status: z.nativeEnum(PaymentStatus),
  amountMinor: moneyMinorSchema,
  currency: currencySchema,
});
export type PaymentIntentResponse = z.infer<typeof paymentIntentResponseSchema>;

export const refundPaymentSchema = z.object({
  amountMinor: moneyMinorSchema.optional(), // full refund when omitted
  reason: z.string().max(500).optional(),
});
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;

/** Driver confirms a cash-on-delivery collection. */
export const confirmCashPaymentSchema = z.object({
  collectedMinor: moneyMinorSchema,
});
export type ConfirmCashPaymentInput = z.infer<typeof confirmCashPaymentSchema>;
