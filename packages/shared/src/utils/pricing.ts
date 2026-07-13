import type { PricingRule, PricingSnapshot, SurgeWindow } from '../schemas/pricing.js';

/** Round to whole minor units (never emit fractional cents). */
function roundMinor(n: number): number {
  return Math.round(n);
}

/** Is `at` inside any of the configured surge windows? Returns the multiplier. */
export function resolveSurgeMultiplier(windows: SurgeWindow[], at: Date): number {
  const day = at.getDay(); // 0=Sun
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  let mult = 1;
  for (const w of windows) {
    if (!w.days.includes(day)) continue;
    // Handle windows that do not cross midnight (validation keeps them simple).
    if (hhmm >= w.startTime && hhmm <= w.endTime) {
      mult = Math.max(mult, w.multiplier);
    }
  }
  return mult;
}

export interface ComputePricingArgs {
  rule: Pick<
    PricingRule,
    'zoneId' | 'id' | 'baseFeeMinor' | 'perKmMinor' | 'minOrderMinor' | 'freeDeliveryThresholdMinor' | 'surgeWindows'
  > | null;
  subtotalMinor: number;
  distanceKm: number;
  currency: string;
  at?: Date;
}

/**
 * Pure, deterministic pricing computation. Produces the snapshot that is FROZEN
 * onto the order at checkout. Shared so the dashboard can preview the exact
 * total the API will charge.
 *
 * delivery fee = (base + perKm*distance) * surge, waived when the subtotal
 * meets the free-delivery threshold.
 */
export function computePricing({
  rule,
  subtotalMinor,
  distanceKm,
  currency,
  at = new Date(),
}: ComputePricingArgs): PricingSnapshot {
  if (!rule) {
    // No zone/rule matched — free-form fallback with zero delivery fee.
    return {
      zoneId: null,
      pricingRuleId: null,
      distanceKm,
      subtotalMinor,
      baseFeeMinor: 0,
      distanceFeeMinor: 0,
      surgeMultiplier: 1,
      surgeFeeMinor: 0,
      freeDeliveryApplied: false,
      deliveryFeeMinor: 0,
      minOrderMinor: 0,
      minOrderMet: true,
      totalMinor: subtotalMinor,
      currency,
    };
  }

  const baseFeeMinor = rule.baseFeeMinor;
  const distanceFeeMinor = roundMinor(rule.perKmMinor * distanceKm);
  const surgeMultiplier = resolveSurgeMultiplier(rule.surgeWindows ?? [], at);

  const preSurge = baseFeeMinor + distanceFeeMinor;
  const surged = roundMinor(preSurge * surgeMultiplier);
  const surgeFeeMinor = surged - preSurge;

  const freeThreshold = rule.freeDeliveryThresholdMinor;
  const freeDeliveryApplied = freeThreshold != null && subtotalMinor >= freeThreshold;
  const deliveryFeeMinor = freeDeliveryApplied ? 0 : surged;

  const minOrderMet = subtotalMinor >= rule.minOrderMinor;

  return {
    zoneId: rule.zoneId,
    pricingRuleId: rule.id,
    distanceKm,
    subtotalMinor,
    baseFeeMinor,
    distanceFeeMinor,
    surgeMultiplier,
    surgeFeeMinor,
    freeDeliveryApplied,
    deliveryFeeMinor,
    minOrderMinor: rule.minOrderMinor,
    minOrderMet,
    totalMinor: subtotalMinor + deliveryFeeMinor,
    currency,
  };
}
