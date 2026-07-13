import { describe, expect, it } from 'vitest';
import { cn, formatMoney } from './utils';

describe('formatMoney', () => {
  it('formats minor units as AED currency', () => {
    expect(formatMoney(3500)).toContain('35');
    expect(formatMoney(0)).toContain('0');
  });
});

describe('cn', () => {
  it('merges and dedupes tailwind classes', () => {
    const hidden = false;
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', hidden && 'hidden', 'font-bold')).toBe('text-sm font-bold');
  });
});
