import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redisKeys, type GeoPoint } from '@marhaba/shared';
import { RedisService } from '../../common/redis/redis.service';

/**
 * ETA via the Mapbox Directions/Matrix API. Results are cached in Redis and
 * keyed on rounded coordinates so nearby requests share a cache entry, keeping
 * us well under Mapbox rate limits. Falls back to a haversine estimate when
 * Mapbox is not configured.
 */
@Injectable()
export class EtaService {
  private readonly logger = new Logger(EtaService.name);
  private readonly token?: string;
  private readonly cacheTtl: number;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.token = config.get<string>('mapboxToken');
    this.cacheTtl = config.get<number>('etaCacheTtlSeconds') ?? 60;
  }

  /** Drive-time ETA (seconds) from `from` to `to`. */
  async estimateSeconds(from: GeoPoint, to: GeoPoint): Promise<number> {
    const key = redisKeys.etaCache(this.coordKey(from), this.coordKey(to));
    const cached = await this.redis.get<number>(key);
    if (cached != null) return cached;

    const seconds = this.token
      ? await this.fetchFromMapbox(from, to)
      : this.fallbackEstimate(from, to);

    await this.redis.set(key, seconds, this.cacheTtl);
    return seconds;
  }

  private async fetchFromMapbox(from: GeoPoint, to: GeoPoint): Promise<number> {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}` +
      `?sources=0&destinations=1&annotations=duration&access_token=${this.token}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Mapbox ${res.status}`);
      const json = (await res.json()) as { durations?: number[][] };
      const seconds = json.durations?.[0]?.[0];
      if (seconds == null) throw new Error('No duration in response');
      return Math.round(seconds);
    } catch (err) {
      this.logger.warn(`Mapbox ETA failed, using fallback: ${(err as Error).message}`);
      return this.fallbackEstimate(from, to);
    }
  }

  /** ~25 km/h urban average over great-circle distance. */
  private fallbackEstimate(from: GeoPoint, to: GeoPoint): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(to.lat - from.lat);
    const dLng = toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(a));
    return Math.round((km / 25) * 3600);
  }

  private coordKey(p: GeoPoint): string {
    return `${p.lng.toFixed(3)},${p.lat.toFixed(3)}`;
  }
}
