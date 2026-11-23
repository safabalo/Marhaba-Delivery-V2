import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format integer minor units as a currency string. */
export function formatMoney(minor: number, currency = 'AED'): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(minor / 100);
}

/** Human ETA, e.g. 125 → "2m", 3700 → "1h 2m". Null → "—". */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return '<1m';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}
