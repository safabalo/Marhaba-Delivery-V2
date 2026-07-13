/** Cross-cutting constants shared by all packages. */

export const HTTP_HEADER = {
  IDEMPOTENCY_KEY: 'idempotency-key',
  REQUEST_ID: 'x-request-id',
  STRIPE_SIGNATURE: 'stripe-signature',
} as const;

export const COOKIE = {
  ACCESS_TOKEN: 'mrb_access',
  REFRESH_TOKEN: 'mrb_refresh',
} as const;

/** Socket.IO event names — shared contract between server and clients. */
export const SOCKET_EVENT = {
  // client → server
  JOIN_ORDER: 'order:join',
  LEAVE_ORDER: 'order:leave',
  DRIVER_LOCATION_UPDATE: 'driver:location:update',
  JOIN_DISPATCH: 'dispatch:join',
  // server → client
  ORDER_STATUS_CHANGED: 'order:status',
  ORDER_ASSIGNED: 'order:assigned',
  DRIVER_LOCATION: 'driver:location',
  DISPATCH_BOARD_UPDATE: 'dispatch:board',
  ETA_UPDATED: 'order:eta',
} as const;

/** Socket.IO room helpers. */
export const socketRooms = {
  order: (orderId: string) => `order:${orderId}`,
  driver: (driverId: string) => `driver:${driverId}`,
  dispatch: (tenantId = 'default') => `dispatch:${tenantId}`,
} as const;

/** Redis key namespaces. */
export const redisKeys = {
  driverLocation: (driverId: string) => `driver:loc:${driverId}`,
  driverGeoIndex: 'drivers:geo',
  idempotency: (key: string) => `idem:${key}`,
  etaCache: (from: string, to: string) => `eta:${from}:${to}`,
  rateLimit: (bucket: string, id: string) => `rl:${bucket}:${id}`,
  otp: (orderId: string) => `otp:${orderId}`,
} as const;

/** BullMQ queue names. */
export const QUEUE = {
  SCHEDULED_ORDERS: 'scheduled-orders',
  NOTIFICATIONS: 'notifications',
  RETRY_DELIVERY: 'retry-delivery',
  ETA_REFRESH: 'eta-refresh',
  LOCATION_HISTORY: 'location-history',
} as const;

export const MONEY = {
  /** All monetary amounts are stored/transported as integer minor units (e.g. cents). */
  CURRENCY_DEFAULT: 'AED',
  MINOR_UNITS: 100,
} as const;

export const GEO = {
  EARTH_RADIUS_KM: 6371,
  DEFAULT_SRID: 4326,
  /** Max radius (km) considered when auto-assigning the nearest driver. */
  NEAREST_DRIVER_RADIUS_KM: 15,
} as const;

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24h
