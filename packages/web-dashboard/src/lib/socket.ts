import { SOCKET_EVENT } from '@marhaba/shared';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Lazily-created shared Socket.IO connection (cookie auth flows automatically). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ transports: ['websocket'], withCredentials: true });
  }
  return socket;
}

export function joinDispatch(): void {
  getSocket().emit(SOCKET_EVENT.JOIN_DISPATCH);
}

export function joinOrder(orderId: string): void {
  getSocket().emit(SOCKET_EVENT.JOIN_ORDER, { orderId });
}
