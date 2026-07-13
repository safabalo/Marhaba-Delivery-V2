# syntax=docker/dockerfile:1
# Multi-stage build for the Marhaba API. Build context is the repo root:
#   docker build -f packages/api/Dockerfile -t marhaba-api .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- Dependencies ----------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile=false --filter @marhaba/api... --filter @marhaba/shared

# --- Build -----------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN pnpm --filter @marhaba/shared build \
 && pnpm --filter @marhaba/api prisma:generate \
 && pnpm --filter @marhaba/api build

# --- Runtime ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=build /app/packages/api/prisma ./packages/api/prisma
COPY --from=build /app/packages/api/package.json ./packages/api/package.json

WORKDIR /app/packages/api
EXPOSE 3000
# Run pending migrations then boot.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
