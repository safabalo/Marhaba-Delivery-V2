import { getDb } from './db';
import { apiFetch } from './api';

export type OutboxType =
  | 'ORDER_TRANSITION'
  | 'LOCATION_PING'
  | 'DELIVERY_FAILURE'
  | 'PROOF_OF_DELIVERY'
  | 'CASH_CONFIRM';

interface OutboxRow {
  id: number;
  type: OutboxType;
  payload: string;
  idempotency_key: string | null;
  attempts: number;
}

/** How each outbox item maps to an API call. */
const routes: Record<OutboxType, (p: any) => { method: string; path: string; body?: unknown }> = {
  ORDER_TRANSITION: (p) => ({ method: 'POST', path: `/orders/${p.orderId}/transition`, body: p.body }),
  DELIVERY_FAILURE: (p) => ({ method: 'POST', path: `/orders/${p.orderId}/delivery/failure`, body: p.body }),
  PROOF_OF_DELIVERY: (p) => ({ method: 'POST', path: `/orders/${p.orderId}/delivery/pod`, body: p.body }),
  CASH_CONFIRM: (p) => ({ method: 'POST', path: `/payments/cash/${p.orderId}/confirm`, body: p.body }),
  // Location pings are best-effort and go over the socket when online; the
  // outbox is the fallback used when the socket is unavailable.
  LOCATION_PING: (p) => ({ method: 'POST', path: `/drivers/me/location`, body: p.body }),
};

const MAX_ATTEMPTS = 8;

/** Enqueue an action. Returns immediately — the UI does not wait on the network. */
export async function enqueue(
  type: OutboxType,
  payload: unknown,
  idempotencyKey?: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO outbox (type, payload, idempotency_key, created_at) VALUES (?, ?, ?, ?)`,
    type,
    JSON.stringify(payload),
    idempotencyKey ?? null,
    Date.now(),
  );
}

/**
 * Flush pending outbox items in FIFO order. Mutating actions carry an
 * Idempotency-Key so replays after a flaky connection never double-apply.
 * Called on reconnect, on app foreground, and on a timer.
 */
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT id, type, payload, idempotency_key, attempts FROM outbox
     WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 50`,
  );

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const route = routes[row.type](JSON.parse(row.payload));
    try {
      await apiFetch(route.path, {
        method: route.method,
        body: route.body ? JSON.stringify(route.body) : undefined,
        headers: row.idempotency_key ? { 'Idempotency-Key': row.idempotency_key } : undefined,
      });
      await db.runAsync(`UPDATE outbox SET status = 'SENT' WHERE id = ?`, row.id);
      sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'DEAD' : 'PENDING';
      await db.runAsync(
        `UPDATE outbox SET attempts = ?, last_error = ?, status = ? WHERE id = ?`,
        attempts,
        String((err as Error).message).slice(0, 300),
        status,
        row.id,
      );
      failed++;
      // Stop on the first failure to preserve ordering (likely offline).
      break;
    }
  }
  return { sent, failed };
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'`,
  );
  return row?.n ?? 0;
}
