import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  HTTP_HEADER,
  IDEMPOTENCY_TTL_SECONDS,
  redisKeys,
} from '@marhaba/shared';
import type { Request, Response } from 'express';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { AuthenticatedUser } from '../guards/jwt-auth.guard';

/**
 * Idempotency-Key interceptor for unsafe, replay-sensitive endpoints
 * (order creation, payment intents). Behaviour:
 *   1. No key present → pass through unchanged.
 *   2. Key present + a stored response exists (same key/method/path + same
 *      request body hash) → replay the stored response.
 *   3. Key present + same key but a *different* body → 409 (key reuse).
 *   4. Otherwise acquire a short Redis lock, run the handler, and persist the
 *      response for future replays.
 *
 * Apply per-route with `@UseInterceptors(IdempotencyInterceptor)`.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.header(HTTP_HEADER.IDEMPOTENCY_KEY);

    if (!key) return next.handle();

    const method = req.method;
    const path = req.path;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');
    const userId = req.user?.id ?? null;

    return from(this.prepare(key, method, path, requestHash, userId)).pipe(
      switchMap((prepared) => {
        if (prepared.replay) {
          res.status(prepared.statusCode ?? 200);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(prepared.body);
        }
        return next.handle().pipe(
          tap({
            next: (body) =>
              void this.persist(key, method, path, requestHash, userId, res.statusCode || 201, body),
          }),
        );
      }),
    );
  }

  private async prepare(
    key: string,
    method: string,
    path: string,
    requestHash: string,
    userId: string | null,
  ): Promise<{ replay: boolean; statusCode?: number; body?: unknown }> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key_method_path: { key, method, path } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('Idempotency-Key already used with a different request body');
      }
      if (existing.responseBody !== null && existing.responseBody !== undefined) {
        return { replay: true, statusCode: existing.statusCode ?? 200, body: existing.responseBody };
      }
      // In-flight: a concurrent request holds the row but has not finished.
      throw new ConflictException('A request with this Idempotency-Key is already in progress');
    }

    // Redis lock guards the race between concurrent first-time requests.
    const lockAcquired = await this.redis.setNx(
      redisKeys.idempotency(`${key}:${method}:${path}`),
      userId ?? 'anon',
      IDEMPOTENCY_TTL_SECONDS,
    );
    if (!lockAcquired) {
      throw new ConflictException('A request with this Idempotency-Key is already in progress');
    }

    await this.prisma.idempotencyKey.create({
      data: {
        key,
        method,
        path,
        requestHash,
        userId,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000),
      },
    });
    return { replay: false };
  }

  private async persist(
    key: string,
    method: string,
    path: string,
    _requestHash: string,
    _userId: string | null,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { key_method_path: { key, method, path } },
      data: { statusCode, responseBody: (body ?? null) as object },
    });
  }
}
