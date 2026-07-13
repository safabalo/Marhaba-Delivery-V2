import type { Address } from '@marhaba/shared';

/**
 * Platform pickup origin (single dark-kitchen model). In a multi-merchant
 * build this would come from the merchant record; kept as a constant here and
 * frozen onto each order at checkout.
 */
export const DEFAULT_PICKUP_ADDRESS: Address = {
  label: 'Marhaba Central Kitchen',
  line1: 'Sheikh Zayed Rd',
  city: 'Dubai',
  country: 'AE',
  point: { lng: 55.2708, lat: 25.2048 },
};

/** Human-friendly order reference, e.g. MRB-7Q3K8F. */
export function generateOrderReference(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `MRB-${out}`;
}
