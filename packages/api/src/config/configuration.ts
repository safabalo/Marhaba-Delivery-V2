import { z } from 'zod';

/**
 * Environment schema. Validated once at boot — the app refuses to start with
 * an invalid/missing config. Secrets are provided by the platform's secrets
 * manager (never a committed .env).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(3000),
  API_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().int().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().default(1209600),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z.coerce.boolean().default(false),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  MAPBOX_ACCESS_TOKEN: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DRIVER_LOCATION_THROTTLE_MS: z.coerce.number().int().default(5000),
  ETA_CACHE_TTL_SECONDS: z.coerce.number().int().default(60),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Structured config object exposed via ConfigService.get('...'). */
export function loadConfiguration() {
  const env = validateEnv(process.env);
  return {
    env,
    nodeEnv: env.NODE_ENV,
    isProd: env.NODE_ENV === 'production',
    port: env.API_PORT,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    cookie: {
      domain: env.COOKIE_DOMAIN,
      secure: env.COOKIE_SECURE,
    },
    redisUrl: env.REDIS_URL,
    databaseUrl: env.DATABASE_URL,
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
    mapboxToken: env.MAPBOX_ACCESS_TOKEN,
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicUrl: env.S3_PUBLIC_URL,
    },
    logLevel: env.LOG_LEVEL,
    driverLocationThrottleMs: env.DRIVER_LOCATION_THROTTLE_MS,
    etaCacheTtlSeconds: env.ETA_CACHE_TTL_SECONDS,
  };
}

export type AppConfig = ReturnType<typeof loadConfiguration>;
