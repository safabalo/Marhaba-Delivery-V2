import { z } from 'zod';
import { currencySchema, moneyMinorSchema } from './common.js';

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a URL-safe slug'),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const productSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  priceMinor: moneyMinorSchema,
  currency: currencySchema,
  imageUrl: z.string().url().nullable(),
  isAvailable: z.boolean(),
  prepTimeMinutes: z.number().int().nonnegative().nullable(),
});
export type Product = z.infer<typeof productSchema>;

export const createProductSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(160),
  slug: z
    .string()
    .min(1)
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(2000).optional(),
  priceMinor: moneyMinorSchema,
  currency: currencySchema.default('AED'),
  imageUrl: z.string().url().optional(),
  isAvailable: z.boolean().default(true),
  prepTimeMinutes: z.number().int().nonnegative().max(240).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  categoryId: z.string().optional(),
  search: z.string().max(120).optional(),
  availableOnly: z.coerce.boolean().optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
