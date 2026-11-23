import { OrderStatus } from '@marhaba/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DriverLocationService } from './driver-location.service';

function build(overrides: { profile?: unknown; order?: unknown } = {}) {
  const prisma = {
    driverProfile: {
      findUnique: vi.fn().mockResolvedValue(
        'profile' in overrides ? overrides.profile : { id: 'drv1', activeOrderId: 'o1' },
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    order: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.order ?? {
          status: OrderStatus.OUT_FOR_DELIVERY,
          pickupAddress: { point: { lng: 55.1, lat: 25.1 } },
          dropoffLng: 55.3,
          dropoffLat: 25.3,
        },
      ),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const redis = {
    setDriverLocation: vi.fn().mockResolvedValue(undefined),
    setNx: vi.fn().mockResolvedValue(true), // history/eta window open
    get: vi.fn(),
  };
  const geo = { recordDriverLocation: vi.fn().mockResolvedValue(undefined) };
  const realtime = { emitDriverLocation: vi.fn(), emitEta: vi.fn() };
  const eta = { estimateSeconds: vi.fn().mockResolvedValue(300) };
  const config = { get: vi.fn().mockReturnValue(5000) };

  const service = new DriverLocationService(
    prisma as never,
    redis as never,
    geo as never,
    realtime as never,
    eta as never,
    config as never,
  );
  return { service, prisma, redis, geo, realtime, eta };
}

const ping = { lng: 55.2, lat: 25.2, recordedAt: new Date() } as never;

describe('DriverLocationService.ingestPing', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('resolves the driver profile from the user id (not treating userId as profile id)', async () => {
    await ctx.service.ingestPing('user1', ping);
    expect(ctx.prisma.driverProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user1' },
      select: { id: true, activeOrderId: true },
    });
    // Hot cache + last-known keyed by the PROFILE id, not the user id.
    expect(ctx.prisma.driverProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'drv1' } }),
    );
  });

  it('fans out the location to the active order and records history', async () => {
    await ctx.service.ingestPing('user1', ping);
    expect(ctx.realtime.emitDriverLocation).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ driverId: 'drv1', lng: 55.2, lat: 25.2 }),
    );
    expect(ctx.geo.recordDriverLocation).toHaveBeenCalledWith(
      expect.objectContaining({ driverId: 'drv1', orderId: 'o1' }),
    );
  });

  it('recomputes ETA to the dropoff when out for delivery and broadcasts it', async () => {
    await ctx.service.ingestPing('user1', ping);
    expect(ctx.eta.estimateSeconds).toHaveBeenCalledWith(
      { lng: 55.2, lat: 25.2 },
      { lng: 55.3, lat: 25.3 },
    );
    expect(ctx.prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { etaSeconds: 300 },
    });
    expect(ctx.realtime.emitEta).toHaveBeenCalledWith('o1', 300);
  });

  it('targets the pickup when still heading to pickup', async () => {
    ctx = build({ order: { status: OrderStatus.ASSIGNED, pickupAddress: { point: { lng: 55.1, lat: 25.1 } }, dropoffLng: 55.3, dropoffLat: 25.3 } });
    await ctx.service.ingestPing('user1', ping);
    expect(ctx.eta.estimateSeconds).toHaveBeenCalledWith(
      { lng: 55.2, lat: 25.2 },
      { lng: 55.1, lat: 25.1 },
    );
  });

  it('no-ops for an unknown driver', async () => {
    ctx = build({ profile: null });
    await ctx.service.ingestPing('ghost', ping);
    expect(ctx.realtime.emitDriverLocation).not.toHaveBeenCalled();
    expect(ctx.geo.recordDriverLocation).not.toHaveBeenCalled();
  });

  it('skips history + ETA when the throttle window is closed', async () => {
    ctx = build();
    ctx.redis.setNx.mockResolvedValueOnce(false);
    await ctx.service.ingestPing('user1', ping);
    expect(ctx.realtime.emitDriverLocation).toHaveBeenCalled(); // still fans out
    expect(ctx.geo.recordDriverLocation).not.toHaveBeenCalled();
    expect(ctx.eta.estimateSeconds).not.toHaveBeenCalled();
  });
});
