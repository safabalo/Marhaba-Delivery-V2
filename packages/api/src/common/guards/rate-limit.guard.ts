import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { redisKeys } from '@marhaba/shared';
import type { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service';
import type { AuthenticatedUser } from './jwt-auth.guard';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  /** Bucket name — keeps independent limits from colliding. */
  bucket?: string;
}

export const RATE_LIMIT_KEY = 'rateLimit';
/** e.g. @RateLimit({ limit: 5, windowSeconds: 60, bucket: 'login' }) */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, opts);

/**
 * Distributed fixed-window rate limiting backed by Redis. A global default is
 * applied to every route; @RateLimit() overrides it per-handler (e.g. stricter
 * limits on login and order placement).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaults: Required<RateLimitOptions> = {
    limit: 120,
    windowSeconds: 60,
    bucket: 'global',
  };

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const override = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const opts = { ...this.defaults, ...override };

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const res = context.switchToHttp().getResponse<Response>();
    const identity = req.user?.id ?? req.ip ?? 'anon';
    const key = redisKeys.rateLimit(opts.bucket, identity);

    const { allowed, remaining, resetSeconds } = await this.redis.rateLimit(
      key,
      opts.limit,
      opts.windowSeconds,
    );

    res.setHeader('X-RateLimit-Limit', opts.limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (!allowed) {
      res.setHeader('Retry-After', resetSeconds);
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
