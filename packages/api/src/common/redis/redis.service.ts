import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER';

/**
 * Thin wrapper over ioredis exposing the primitives the rest of the app needs:
 * cache get/set, atomic idempotency locks, geo (driver index) and simple
 * fixed-window rate limiting. Two connections are provided so the Socket.IO
 * Redis adapter can pub/sub independently of command traffic.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(REDIS_CLIENT) public readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) public readonly subscriber: Redis,
  ) {}

  get pub(): Redis {
    return this.client;
  }

  get sub(): Redis {
    return this.subscriber;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds) await this.client.set(key, raw, 'EX', ttlSeconds);
    else await this.client.set(key, raw);
  }

  /** Set only if absent — returns true when the lock was acquired. */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys);
  }

  /**
   * Fixed-window rate limit. Returns { allowed, remaining, resetSeconds }.
   */
  async rateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
    const count = await this.client.incr(key);
    if (count === 1) await this.client.expire(key, windowSeconds);
    const ttl = await this.client.ttl(key);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: ttl < 0 ? windowSeconds : ttl,
    };
  }

  /** Upsert a driver into the geo index and stash its hot location. */
  async setDriverLocation(
    indexKey: string,
    hotKey: string,
    driverId: string,
    lng: number,
    lat: number,
    payload: unknown,
    ttlSeconds = 120,
  ): Promise<void> {
    await this.client.geoadd(indexKey, lng, lat, driverId);
    await this.set(hotKey, payload, ttlSeconds);
  }

  /** Nearest drivers within radiusKm of a point, closest first. */
  async nearestDrivers(
    indexKey: string,
    lng: number,
    lat: number,
    radiusKm: number,
    count: number,
  ): Promise<Array<{ driverId: string; distanceKm: number }>> {
    const res = (await this.client.geosearch(
      indexKey,
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'COUNT',
      count,
      'WITHDIST',
    )) as Array<[string, string]>;
    return res.map(([driverId, dist]) => ({ driverId, distanceKm: Number(dist) }));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }
}

export function createRedisClient(config: ConfigService): Redis {
  const url = config.get<string>('redisUrl')!;
  const client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
  client.on('error', (e) => new Logger('Redis').error(e.message));
  return client;
}
