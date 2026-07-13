import { z } from 'zod';

export const cuidSchema = z.string().min(1).max(64);
export const uuidSchema = z.string().uuid();
export const idSchema = z.string().min(1);

export const emailSchema = z.string().email().max(320).toLowerCase().trim();

/** E.164-ish phone number. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, 'Must be a valid international phone number');

/** Monetary amount in integer minor units (e.g. cents). Never a float. */
export const moneyMinorSchema = z.number().int().nonnegative();

export const currencySchema = z.string().length(3).toUpperCase();

/** GeoJSON-style [longitude, latitude] tuple used everywhere for geo. */
export const lngLatSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

export const geoPointSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

export const addressSchema = z.object({
  label: z.string().max(120).optional(),
  line1: z.string().min(1).max(240),
  line2: z.string().max(240).optional(),
  city: z.string().min(1).max(120),
  region: z.string().max(120).optional(),
  postalCode: z.string().max(32).optional(),
  country: z.string().length(2).toUpperCase().default('AE'),
  point: geoPointSchema,
  notes: z.string().max(500).optional(),
});
export type Address = z.infer<typeof addressSchema>;

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  });
}

export const timestampsSchema = z.object({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
