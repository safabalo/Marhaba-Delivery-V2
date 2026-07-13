import { z } from 'zod';
import { DriverStatus, UserRole } from '../enums.js';
import { addressSchema, emailSchema, phoneSchema } from './common.js';

export const userSchema = z.object({
  id: z.string(),
  email: emailSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  role: z.nativeEnum(UserRole),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof userSchema>;

/** Admin/manager provisioning of a staff or driver account. */
export const createUserSchema = z.object({
  email: emailSchema,
  fullName: z.string().min(1).max(160),
  phone: phoneSchema.optional(),
  role: z.nativeEnum(UserRole),
  password: z.string().min(10).max(128),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(160).optional(),
  phone: phoneSchema.optional(),
  isActive: z.boolean().optional(),
  role: z.nativeEnum(UserRole).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const savedAddressSchema = addressSchema.extend({
  id: z.string(),
  isDefault: z.boolean().default(false),
});
export type SavedAddress = z.infer<typeof savedAddressSchema>;

/** Driver-specific profile (1:1 with a DRIVER user). */
export const driverProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.nativeEnum(DriverStatus),
  vehicleType: z.enum(['CAR', 'MOTORCYCLE', 'BICYCLE', 'SCOOTER', 'VAN']),
  vehiclePlate: z.string().max(32).nullable(),
  ratingAvg: z.number().min(0).max(5).nullable(),
  activeOrderId: z.string().nullable(),
});
export type DriverProfile = z.infer<typeof driverProfileSchema>;

export const updateDriverStatusSchema = z.object({
  status: z.nativeEnum(DriverStatus),
});
export type UpdateDriverStatusInput = z.infer<typeof updateDriverStatusSchema>;
