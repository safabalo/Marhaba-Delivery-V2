import { describe, expect, it } from 'vitest';
import { computePricing } from './pricing.js';

const baseRule = {
  id: 'rule_1',
  zoneId: 'zone_1',
  baseFeeMinor: 500, // 5.00
  perKmMinor: 100, // 1.00/km
  minOrderMinor: 2000, // 20.00
  freeDeliveryThresholdMinor: 8000, // free over 80.00
  surgeWindows: [],
};

describe('computePricing', () => {
  it('computes base + per-km fee', () => {
    const snap = computePricing({
      rule: baseRule,
      subtotalMinor: 3000,
      distanceKm: 4,
      currency: 'AED',
    });
    expect(snap.distanceFeeMinor).toBe(400);
    expect(snap.deliveryFeeMinor).toBe(900);
    expect(snap.totalMinor).toBe(3900);
    expect(snap.minOrderMet).toBe(true);
  });

  it('waives delivery over the free threshold', () => {
    const snap = computePricing({
      rule: baseRule,
      subtotalMinor: 9000,
      distanceKm: 4,
      currency: 'AED',
    });
    expect(snap.freeDeliveryApplied).toBe(true);
    expect(snap.deliveryFeeMinor).toBe(0);
    expect(snap.totalMinor).toBe(9000);
  });

  it('flags orders below the minimum', () => {
    const snap = computePricing({
      rule: baseRule,
      subtotalMinor: 1000,
      distanceKm: 1,
      currency: 'AED',
    });
    expect(snap.minOrderMet).toBe(false);
  });

  it('applies surge to the delivery fee', () => {
    const at = new Date('2026-07-13T19:00:00'); // Monday 19:00 local
    const snap = computePricing({
      rule: {
        ...baseRule,
        freeDeliveryThresholdMinor: null,
        surgeWindows: [{ days: [1], startTime: '18:00', endTime: '21:00', multiplier: 1.5 }],
      },
      subtotalMinor: 3000,
      distanceKm: 4,
      currency: 'AED',
      at,
    });
    expect(snap.surgeMultiplier).toBe(1.5);
    // (500 + 400) * 1.5 = 1350
    expect(snap.deliveryFeeMinor).toBe(1350);
    expect(snap.surgeFeeMinor).toBe(450);
  });

  it('falls back to zero delivery fee with no rule', () => {
    const snap = computePricing({
      rule: null,
      subtotalMinor: 3000,
      distanceKm: 4,
      currency: 'AED',
    });
    expect(snap.deliveryFeeMinor).toBe(0);
    expect(snap.totalMinor).toBe(3000);
  });
});
