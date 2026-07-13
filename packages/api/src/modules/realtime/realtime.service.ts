import { Injectable, Logger } from '@nestjs/common';
import {
  SOCKET_EVENT,
  socketRooms,
  type DispatchBoardOrder,
  type DriverLocation,
  type OrderStatus,
} from '@marhaba/shared';
import type { Server } from 'socket.io';

/**
 * Facade over the Socket.IO server used by the rest of the app to push
 * real-time updates without depending on the gateway class directly. The
 * gateway registers its `Server` here on init.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  registerServer(server: Server): void {
    this.server = server;
  }

  emitOrderStatus(orderId: string, status: OrderStatus, extra?: Record<string, unknown>): void {
    this.emit(socketRooms.order(orderId), SOCKET_EVENT.ORDER_STATUS_CHANGED, {
      orderId,
      status,
      ...extra,
    });
  }

  emitOrderAssigned(orderId: string, driverId: string, driverName?: string): void {
    this.emit(socketRooms.order(orderId), SOCKET_EVENT.ORDER_ASSIGNED, {
      orderId,
      driverId,
      driverName,
    });
    this.emit(socketRooms.driver(driverId), SOCKET_EVENT.ORDER_ASSIGNED, { orderId });
  }

  emitDriverLocation(orderId: string, location: DriverLocation): void {
    this.emit(socketRooms.order(orderId), SOCKET_EVENT.DRIVER_LOCATION, location);
  }

  emitEta(orderId: string, etaSeconds: number): void {
    this.emit(socketRooms.order(orderId), SOCKET_EVENT.ETA_UPDATED, { orderId, etaSeconds });
  }

  emitDispatchBoard(update: DispatchBoardOrder): void {
    this.emit(socketRooms.dispatch(), SOCKET_EVENT.DISPATCH_BOARD_UPDATE, update);
  }

  private emit(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`Socket server not ready — dropped ${event} to ${room}`);
      return;
    }
    this.server.to(room).emit(event, payload);
  }
}
