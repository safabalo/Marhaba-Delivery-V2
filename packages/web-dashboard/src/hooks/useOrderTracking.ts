import {
  SOCKET_EVENT,
  type DriverLocation,
  type OrderStatus,
  type OrderTracking,
} from '@marhaba/shared';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getSocket, joinOrder } from '../lib/socket';

export interface LiveTracking {
  tracking: OrderTracking | null;
  driver: DriverLocation | null;
  etaSeconds: number | null;
  status: OrderStatus | null;
}

/**
 * Subscribes to a single order's live tracking: seeds from the REST snapshot,
 * then keeps driver position, ETA and status in sync via the order's WebSocket
 * room. Rejoining/cleanup is handled on orderId change.
 */
export function useOrderTracking(orderId: string | null): LiveTracking {
  const [state, setState] = useState<LiveTracking>({
    tracking: null,
    driver: null,
    etaSeconds: null,
    status: null,
  });

  useEffect(() => {
    if (!orderId) {
      setState({ tracking: null, driver: null, etaSeconds: null, status: null });
      return;
    }
    let cancelled = false;

    api
      .get<OrderTracking>(`/orders/${orderId}/tracking`)
      .then((t) => {
        if (cancelled) return;
        setState({ tracking: t, driver: t.driver, etaSeconds: t.etaSeconds, status: t.status });
      })
      .catch(() => undefined);

    const socket = getSocket();
    joinOrder(orderId);

    const onDriver = (loc: DriverLocation) =>
      setState((s) => (loc ? { ...s, driver: loc } : s));
    const onEta = (p: { orderId: string; etaSeconds: number }) =>
      setState((s) => (p.orderId === orderId ? { ...s, etaSeconds: p.etaSeconds } : s));
    const onStatus = (p: { orderId: string; status: OrderStatus }) =>
      setState((s) => (p.orderId === orderId ? { ...s, status: p.status } : s));

    socket.on(SOCKET_EVENT.DRIVER_LOCATION, onDriver);
    socket.on(SOCKET_EVENT.ETA_UPDATED, onEta);
    socket.on(SOCKET_EVENT.ORDER_STATUS_CHANGED, onStatus);

    return () => {
      cancelled = true;
      socket.off(SOCKET_EVENT.DRIVER_LOCATION, onDriver);
      socket.off(SOCKET_EVENT.ETA_UPDATED, onEta);
      socket.off(SOCKET_EVENT.ORDER_STATUS_CHANGED, onStatus);
      socket.emit(SOCKET_EVENT.LEAVE_ORDER, { orderId });
    };
  }, [orderId]);

  return state;
}
