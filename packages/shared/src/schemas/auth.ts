import { z } from 'zod';
import { UserRole } from '../enums.js';
import { emailSchema, phoneSchema } from './common.js';

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9]/, 'Must contain a digit');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().min(1).max(160),
  phone: phoneSchema.optional(),
  // Public self-registration is CLIENT-only; staff roles are provisioned by admins.
  role: z.literal(UserRole.CLIENT).optional().default(UserRole.CLIENT),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  // Normally read from the httpOnly cookie; body form supported for native clients.
  refreshToken: z.string().min(1).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: emailSchema,
  fullName: z.string(),
  role: z.nativeEnum(UserRole),
  phone: z.string().nullable().optional(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  user: authUserSchema,
  accessToken: z.string(),
  expiresIn: z.number().int(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** JWT payload shape (access + refresh share the subject/role). */
export const jwtPayloadSchema = z.object({
  sub: z.string(),
  role: z.nativeEnum(UserRole),
  email: emailSchema,
  type: z.enum(['access', 'refresh']),
  jti: z.string().optional(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
