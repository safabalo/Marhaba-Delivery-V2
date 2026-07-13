# Marhaba Delivery v2

A food-delivery + last-mile logistics platform, built as a TypeScript monorepo
(pnpm + Turborepo).

## Packages

| Package                   | Stack                                                                 | Purpose                              |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `@marhaba/shared`         | TypeScript, zod                                                       | Shared schemas, types, enums, the order state machine, pricing/geo utils |
| `@marhaba/api`            | NestJS, Prisma, PostgreSQL + PostGIS, Redis, Socket.IO, Stripe, BullMQ | Core API, real-time, jobs            |
| `@marhaba/web-dashboard`  | Vite, React, Tailwind, shadcn-style UI, TanStack Query, react-map-gl   | Dispatcher / manager console         |
| `@marhaba/driver-app`     | React Native (Expo), SQLite outbox, background geolocation, camera     | Offline-first driver app             |

## Architecture highlights

- **Auth & RBAC** — JWT access + refresh tokens in httpOnly cookies (web) or the
  secure enclave (native); argon2id password hashing; Nest guards enforce the
  `client / driver / dispatcher / manager / admin` roles.
- **Order state machine** — an explicit, shared transition table
  (`packages/shared/src/state-machine`) is the single source of truth. Every
  transition is written to the **append-only `OrderEvent` audit log**, which also
  powers driver performance analytics.
- **Delivery zones & pricing** — PostGIS polygons resolve the zone for a dropoff;
  per-zone pricing rules (base + per-km + min-order + free-delivery threshold +
  time-window surge) are computed and **frozen onto the order at checkout** so
  historical totals never change.
- **Real-time** — Socket.IO (with the Redis adapter for horizontal scale) pushes
  order-status and throttled live driver locations. Locations are stored hot in
  Redis (+ geo index) and appended to PostGIS history.
- **Assignment** — manual, or nearest-available-driver via PostGIS distance.
- **Idempotency** — an `Idempotency-Key` interceptor (Redis lock + durable table)
  guards order and payment endpoints; Stripe calls also use Stripe-native keys.
- **Jobs** — BullMQ delayed jobs drive scheduled deliveries and failed-delivery
  retries.
- **Security** — Redis rate limiting, helmet, strict CORS allowlist, zod
  validation on every input, Stripe webhook signature verification, config
  validated at boot, and **no committed `.env`** (see `.env.example`).

## Getting started

```bash
# 1. Install
pnpm install

# 2. Configure
cp .env.example .env   # then fill in secrets

# 3. Start infra (Postgres+PostGIS, Redis)
docker compose up -d postgres redis

# 4. Build shared types, set up the database
pnpm --filter @marhaba/shared build
pnpm --filter @marhaba/api prisma:generate
pnpm --filter @marhaba/api exec prisma db push
psql "$DATABASE_URL" -f packages/api/prisma/postgis.sql   # spatial indexes
pnpm --filter @marhaba/api prisma:seed

# 5. Run everything (API :3000, dashboard :5173)
pnpm dev
```

Driver app: `pnpm --filter @marhaba/driver-app start` (Expo).

Seed logins (all password `Password123`): `admin@`, `manager@`,
`dispatcher@`, `driver@`, `client@marhaba.delivery`.

## Scripts

```bash
pnpm build          # build all packages
pnpm typecheck      # tsc across the workspace
pnpm lint           # eslint
pnpm test           # unit tests (Vitest)
pnpm test:e2e       # Playwright / API e2e (needs infra)
```

## Roadmap / phase status

- **Phase 0 — Foundations & secure auth** ✅ monorepo, shared package, Prisma
  domain schema, config validation, Redis, argon2 auth, RBAC guards, rate
  limiting, idempotency interceptor, security middleware.
- **Phase 1 — Secure commerce happy path** ✅ catalog, cart→order with frozen
  pricing, order state machine + audit log, payments (Stripe PaymentIntents +
  webhooks, cash-on-delivery).
- **Phase 2+ — Logistics** 🚧 scaffolded and wired: delivery zones & pricing,
  manual/auto assignment, real-time tracking, scheduled + failed-delivery
  workflows, proof of delivery, dispatcher board, driver analytics, multi-channel
  notifications, offline-first driver outbox. Provider integrations (FCM/Twilio/
  email/S3) are behind adapters and no-op until configured.

## Deployment

Dockerized (`packages/api/Dockerfile`). Targets Fly.io / Railway with managed
Postgres (Neon/Supabase, PostGIS enabled) and Redis (Upstash). Secrets come from
the platform's secrets manager — never a committed file.
