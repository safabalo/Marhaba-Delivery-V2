/**
 * Domain enums shared across API, dashboard and driver app.
 * These are the single source of truth and must stay in sync with the
 * Prisma schema (packages/api/prisma/schema.prisma).
 */

export const UserRole = {
  CLIENT: 'CLIENT',
  DRIVER: 'DRIVER',
  DISPATCHER: 'DISPATCHER',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const USER_ROLES = Object.values(UserRole);

/**
 * Order lifecycle. The happy path is:
 *   DRAFT → PLACED → ACCEPTED → ASSIGNED → EN_ROUTE_TO_PICKUP →
 *   PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
 * with side states for scheduling, failure/retry, return, cancellation
 * and refund handled by the state machine (see state-machine/order-status.ts).
 */
export const OrderStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  ASSIGNED: 'ASSIGNED',
  EN_ROUTE_TO_PICKUP: 'EN_ROUTE_TO_PICKUP',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  RETRY_SCHEDULED: 'RETRY_SCHEDULED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export const ORDER_STATUSES = Object.values(OrderStatus);

/** Terminal states — an order can never leave these. */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.RETURNED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
];

export const PaymentMethod = {
  CARD: 'CARD',
  CASH_ON_DELIVERY: 'CASH_ON_DELIVERY',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  REQUIRES_ACTION: 'REQUIRES_ACTION',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const AssignmentMode = {
  MANUAL: 'MANUAL',
  AUTO_NEAREST: 'AUTO_NEAREST',
} as const;
export type AssignmentMode = (typeof AssignmentMode)[keyof typeof AssignmentMode];

export const DriverStatus = {
  OFFLINE: 'OFFLINE',
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  ON_BREAK: 'ON_BREAK',
} as const;
export type DriverStatus = (typeof DriverStatus)[keyof typeof DriverStatus];

/** Reasons a delivery attempt can fail. Drives the retry/return workflow. */
export const DeliveryFailureReason = {
  CUSTOMER_UNAVAILABLE: 'CUSTOMER_UNAVAILABLE',
  WRONG_ADDRESS: 'WRONG_ADDRESS',
  CUSTOMER_REFUSED: 'CUSTOMER_REFUSED',
  DAMAGED: 'DAMAGED',
  RESTAURANT_CLOSED: 'RESTAURANT_CLOSED',
  ACCESS_BLOCKED: 'ACCESS_BLOCKED',
  WEATHER: 'WEATHER',
  OTHER: 'OTHER',
} as const;
export type DeliveryFailureReason =
  (typeof DeliveryFailureReason)[keyof typeof DeliveryFailureReason];

export const ProofOfDeliveryType = {
  PHOTO: 'PHOTO',
  OTP_CODE: 'OTP_CODE',
  SIGNATURE: 'SIGNATURE',
} as const;
export type ProofOfDeliveryType =
  (typeof ProofOfDeliveryType)[keyof typeof ProofOfDeliveryType];

export const NotificationChannel = {
  PUSH: 'PUSH',
  SMS: 'SMS',
  EMAIL: 'EMAIL',
  IN_APP: 'IN_APP',
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  READ: 'READ',
} as const;
export type NotificationStatus =
  (typeof NotificationStatus)[keyof typeof NotificationStatus];

/**
 * Append-only audit event types written to OrderEvent. This is the trail that
 * powers driver performance analytics and the dispatcher timeline.
 */
export const OrderEventType = {
  CREATED: 'CREATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  SCHEDULED: 'SCHEDULED',
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_SUCCEEDED: 'PAYMENT_SUCCEEDED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REFUNDED: 'REFUNDED',
  ASSIGNED: 'ASSIGNED',
  REASSIGNED: 'REASSIGNED',
  UNASSIGNED: 'UNASSIGNED',
  DRIVER_ACCEPTED: 'DRIVER_ACCEPTED',
  DRIVER_ARRIVED_PICKUP: 'DRIVER_ARRIVED_PICKUP',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERY_ATTEMPTED: 'DELIVERY_ATTEMPTED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
  DISPATCHER_INTERVENED: 'DISPATCHER_INTERVENED',
  NOTE: 'NOTE',
} as const;
export type OrderEventType = (typeof OrderEventType)[keyof typeof OrderEventType];

/** Actor that produced an order event (for the audit trail). */
export const ActorType = {
  SYSTEM: 'SYSTEM',
  CLIENT: 'CLIENT',
  DRIVER: 'DRIVER',
  DISPATCHER: 'DISPATCHER',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
  WEBHOOK: 'WEBHOOK',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];
