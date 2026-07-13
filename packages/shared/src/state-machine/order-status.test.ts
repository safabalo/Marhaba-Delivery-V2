import { describe, expect, it } from 'vitest';
import { OrderStatus } from '../enums.js';
import {
  assertTransition,
  canTransition,
  IllegalOrderTransitionError,
  isTerminal,
} from './order-status.js';

describe('order status state machine', () => {
  it('allows the happy path', () => {
    const path: OrderStatus[] = [
      OrderStatus.DRAFT,
      OrderStatus.PLACED,
      OrderStatus.ACCEPTED,
      OrderStatus.ASSIGNED,
      OrderStatus.EN_ROUTE_TO_PICKUP,
      OrderStatus.PICKED_UP,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('rejects skipping states', () => {
    expect(canTransition(OrderStatus.PLACED, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(OrderStatus.DRAFT, OrderStatus.PICKED_UP)).toBe(false);
  });

  it('supports the failure → retry → return workflow', () => {
    expect(canTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.FAILED)).toBe(true);
    expect(canTransition(OrderStatus.FAILED, OrderStatus.RETRY_SCHEDULED)).toBe(true);
    expect(canTransition(OrderStatus.RETRY_SCHEDULED, OrderStatus.OUT_FOR_DELIVERY)).toBe(true);
    expect(canTransition(OrderStatus.FAILED, OrderStatus.RETURNED)).toBe(true);
  });

  it('marks terminal states', () => {
    expect(isTerminal(OrderStatus.DELIVERED)).toBe(true);
    expect(isTerminal(OrderStatus.REFUNDED)).toBe(true);
    expect(isTerminal(OrderStatus.PLACED)).toBe(false);
  });

  it('throws on an illegal transition', () => {
    expect(() => assertTransition(OrderStatus.DELIVERED, OrderStatus.PLACED)).toThrow(
      IllegalOrderTransitionError,
    );
  });
});
