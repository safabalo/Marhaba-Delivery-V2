import { describe, expect, it, vi } from 'vitest';
import { EtaService } from './eta.service';

function build() {
  const store = new Map<string, unknown>();
  const redis = {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
  };
  // No Mapbox token configured → deterministic fallback path.
  const config = { get: vi.fn((k: string) => (k === 'etaCacheTtlSeconds' ? 60 : undefined)) };
  const service = new EtaService(config as never, redis as never);
  return { service, redis, store };
}

const dubai = { lng: 55.27, lat: 25.2 };
const nearby = { lng: 55.3, lat: 25.23 };

describe('EtaService (no Mapbox token)', () => {
  it('returns a positive fallback ETA and caches it', async () => {
    const { service, redis } = build();
    const seconds = await service.estimateSeconds(dubai, nearby);
    expect(seconds).toBeGreaterThan(0);
    expect(redis.set).toHaveBeenCalled();
  });

  it('serves a cached ETA without recomputing', async () => {
    const { service, redis } = build();
    await service.estimateSeconds(dubai, nearby);
    redis.set.mockClear();
    const second = await service.estimateSeconds(dubai, nearby);
    expect(second).toBeGreaterThan(0);
    expect(redis.set).not.toHaveBeenCalled(); // cache hit
  });

  it('route() falls back to a null geometry with a duration estimate', async () => {
    const { service } = build();
    const route = await service.route(dubai, nearby);
    expect(route.geometry).toBeNull();
    expect(route.seconds).toBeGreaterThan(0);
  });
});
