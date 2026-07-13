import { OrderStatus, TERMINAL_ORDER_STATUSES } from '../enums.js';

/**
 * Explicit order-status state machine.
 *
 * This is the single source of truth for legal transitions and is shared by
 * the API (to guard mutations) and the dashboards (to render valid actions).
 * The API additionally records every transition to the append-only OrderEvent
 * audit log.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.DRAFT]: [OrderStatus.PLACED, OrderStatus.SCHEDULED, OrderStatus.CANCELLED],
  [OrderStatus.SCHEDULED]: [OrderStatus.PLACED, OrderStatus.CANCELLED],
  [OrderStatus.PLACED]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.ASSIGNED, OrderStatus.CANCELLED],
  [OrderStatus.ASSIGNED]: [
    OrderStatus.EN_ROUTE_TO_PICKUP,
    OrderStatus.ACCEPTED, // unassign back to pool
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.EN_ROUTE_TO_PICKUP]: [OrderStatus.PICKED_UP, OrderStatus.FAILED, OrderStatus.CANCELLED],
  [OrderStatus.PICKED_UP]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.FAILED],
  [OrderStatus.OUT_FOR_DELIVERY]: [
    OrderStatus.DELIVERED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.FAILED]: [
    OrderStatus.RETRY_SCHEDULED,
    OrderStatus.RETURNED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.RETRY_SCHEDULED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.ASSIGNED, OrderStatus.RETURNED],
  // Terminal states.
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
  [OrderStatus.RETURNED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[from] ?? [];
}

export class IllegalOrderTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Illegal order status transition: ${from} → ${to}`);
    this.name = 'IllegalOrderTransitionError';
  }
}

/** Throws {@link IllegalOrderTransitionError} if the transition is not allowed. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalOrderTransitionError(from, to);
  }
}
