import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@marhaba/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service';

/** Lightweight mocks — we exercise the transition guard, not the DB. */
function makeService(currentStatus: OrderStatus) {
  const order = { id: 'o1', status: currentStatus, clientId: 'c1', driverId: null };
  const prisma = {
    order: {
      findUnique: vi.fn().mockResolvedValue(order),
      update: vi.fn().mockResolvedValue({ ...order, status: OrderStatus.ACCEPTED }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        order: { update: vi.fn().mockResolvedValue({ ...order, status: OrderStatus.ACCEPTED }) },
        orderEvent: { create: vi.fn() },
      }),
    ),
  };
  const events = { record: vi.fn(), timeline: vi.fn() };
  const realtime = { emitOrderStatus: vi.fn() };
  const service = new OrdersService(
    prisma as never,
    {} as never,
    events as never,
    realtime as never,
  );
  return { service, prisma, events, realtime };
}

describe('OrdersService.transition', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService(OrderStatus.PLACED);
  });

  it('allows a legal transition and emits realtime + audit event', async () => {
    await ctx.service.transition(
      'o1',
      { to: OrderStatus.ACCEPTED },
      { type: 'DISPATCHER' as never, id: 'd1' },
    );
    expect(ctx.events.record).toHaveBeenCalledOnce();
    expect(ctx.realtime.emitOrderStatus).toHaveBeenCalledWith('o1', OrderStatus.ACCEPTED, {
      reason: undefined,
    });
  });

  it('rejects an illegal transition', async () => {
    await expect(
      ctx.service.transition(
        'o1',
        { to: OrderStatus.DELIVERED },
        { type: 'DISPATCHER' as never, id: 'd1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.events.record).not.toHaveBeenCalled();
  });

  it('throws when the order does not exist', async () => {
    ctx.prisma.order.findUnique.mockResolvedValueOnce(null);
    await expect(
      ctx.service.transition('missing', { to: OrderStatus.ACCEPTED }, { type: 'SYSTEM' as never, id: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
