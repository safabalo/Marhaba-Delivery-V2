import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format integer minor units as a currency string. */
export function formatMoney(minor: number, currency = 'AED'): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(minor / 100);
}
