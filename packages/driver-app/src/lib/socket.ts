import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './api';
import { tokenStore } from './auth';

let socket: Socket | null = null;

/** Shared socket; authenticates with the Bearer token in the handshake. */
export function getSocket(): Socket {
  if (!socket) {
    const origin = API_BASE.replace(/\/api$/, '');
    socket = io(origin, {
      transports: ['websocket'],
      autoConnect: false,
    });
  }
  return socket;
}

export async function connectSocket(): Promise<void> {
  const token = await tokenStore.getAccess();
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) s.connect();
}
