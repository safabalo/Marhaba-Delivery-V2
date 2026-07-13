import { z } from 'zod';
import { moneyMinorSchema } from './common.js';

/**
 * A time-window surge multiplier, e.g. dinner rush.
 * days: 0=Sunday … 6=Saturday. Times are local "HH:mm".
 */
export const surgeWindowSchema = z.object({
  label: z.string().max(80).optional(),
  days: z.array(z.number().int().min(0).max(6)).min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  /** Multiplier applied to the delivery fee, e.g. 1.5 = +50%. */
  multiplier: z.number().min(1).max(5),
});
export type SurgeWindow = z.infer<typeof surgeWindowSchema>;

/**
 * Per-zone pricing rule. At checkout the resolved values are FROZEN onto the
 * order so later rule edits never change historical orders.
 */
export const pricingRuleSchema = z.object({
  id: z.string(),
  zoneId: z.string(),
  baseFeeMinor: moneyMinorSchema,
  perKmMinor: moneyMinorSchema,
  minOrderMinor: moneyMinorSchema,
  freeDeliveryThresholdMinor: moneyMinorSchema.nullable(),
  surgeWindows: z.array(surgeWindowSchema).default([]),
  isActive: z.boolean(),
});
export type PricingRule = z.infer<typeof pricingRuleSchema>;

export const createPricingRuleSchema = z.object({
  zoneId: z.string().min(1),
  baseFeeMinor: moneyMinorSchema,
  perKmMinor: moneyMinorSchema,
  minOrderMinor: moneyMinorSchema.default(0),
  freeDeliveryThresholdMinor: moneyMinorSchema.nullable().optional(),
  surgeWindows: z.array(surgeWindowSchema).default([]),
  isActive: z.boolean().default(true),
});
export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = createPricingRuleSchema.partial();
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;

/**
 * The pricing snapshot frozen onto an order at checkout. Fully self-contained
 * so the order total is reproducible and auditable.
 */
export const pricingSnapshotSchema = z.object({
  zoneId: z.string().nullable(),
  pricingRuleId: z.string().nullable(),
  distanceKm: z.number().nonnegative(),
  subtotalMinor: moneyMinorSchema,
  baseFeeMinor: moneyMinorSchema,
  distanceFeeMinor: moneyMinorSchema,
  surgeMultiplier: z.number().min(1),
  surgeFeeMinor: moneyMinorSchema,
  freeDeliveryApplied: z.boolean(),
  deliveryFeeMinor: moneyMinorSchema,
  minOrderMinor: moneyMinorSchema,
  minOrderMet: z.boolean(),
  totalMinor: moneyMinorSchema,
  currency: z.string(),
});
export type PricingSnapshot = z.infer<typeof pricingSnapshotSchema>;

/** Request to preview a quote before placing an order. */
export const quoteRequestSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(99) }))
    .min(1),
  dropoff: z.object({
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
  }),
  scheduledFor: z.coerce.date().optional(),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
