import { Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  jwtPayloadSchema,
  locationPingSchema,
  SOCKET_EVENT,
  socketRooms,
  UserRole,
  type JwtPayload,
} from '@marhaba/shared';
import { parse as parseCookie } from 'node:querystring';
import type { Server, Socket } from 'socket.io';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from '../../common/redis/redis.service';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { DriverLocationService } from '../drivers/driver-location.service';
import { RealtimeService } from './realtime.service';

/**
 * Socket.IO gateway. Authenticates each socket via the access JWT (cookie or
 * `auth.token`), joins per-order / per-driver / dispatch rooms, and ingests
 * throttled driver location pings. Uses the Redis adapter so it scales across
 * multiple API instances.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnApplicationShutdown
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  // Dedicated adapter connections (duplicated from the shared clients) so the
  // adapter's pub/sub lifecycle is independent of RedisService — otherwise the
  // shared clients get quit before the adapter's close() runs its punsubscribe,
  // which raises an unhandled "Connection is closed" error on shutdown.
  private adapterPub?: Redis;
  private adapterSub?: Redis;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
    private readonly driverLocation: DriverLocationService,
    @Inject(REDIS_CLIENT) private readonly pub: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly sub: Redis,
  ) {}

  afterInit(server: Server): void {
    this.adapterPub = this.pub.duplicate();
    this.adapterSub = this.sub.duplicate();
    server.adapter(createAdapter(this.adapterPub, this.adapterSub));
    this.realtime.registerServer(server);
    this.logger.log('Realtime gateway initialised with Redis adapter');
  }

  // Runs after the WS server (and its adapter) have been closed, so quitting
  // these connections here can't race the adapter's own shutdown.
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.adapterPub?.quit(), this.adapterSub?.quit()]);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const payload = await this.authenticate(client);
      client.data.user = payload;
      // Drivers auto-join their own room for assignment pushes.
      if (payload.role === UserRole.DRIVER) {
        client.join(socketRooms.driver(payload.sub));
      }
    } catch {
      client.emit('error', 'unauthorized');
      client.disconnect(true);
    }
  }

  @SubscribeMessage(SOCKET_EVENT.JOIN_ORDER)
  onJoinOrder(@ConnectedSocket() client: Socket, @MessageBody() body: { orderId: string }): void {
    // Clients see only their own orders; staff can watch any (checked at REST
    // layer when they fetch the order — room join is broadcast-only, no data).
    if (body?.orderId) client.join(socketRooms.order(body.orderId));
  }

  @SubscribeMessage(SOCKET_EVENT.LEAVE_ORDER)
  onLeaveOrder(@ConnectedSocket() client: Socket, @MessageBody() body: { orderId: string }): void {
    if (body?.orderId) client.leave(socketRooms.order(body.orderId));
  }

  @SubscribeMessage(SOCKET_EVENT.JOIN_DISPATCH)
  onJoinDispatch(@ConnectedSocket() client: Socket): void {
    const user = client.data.user as JwtPayload | undefined;
    if (user && [UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN].includes(user.role as any)) {
      client.join(socketRooms.dispatch());
    }
  }

  @SubscribeMessage(SOCKET_EVENT.DRIVER_LOCATION_UPDATE)
  async onDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() raw: unknown,
  ): Promise<void> {
    const user = client.data.user as JwtPayload | undefined;
    if (!user || user.role !== UserRole.DRIVER) return;
    const parsed = locationPingSchema.safeParse(raw);
    if (!parsed.success) return;
    // Server-side throttling + fan-out handled in the service.
    await this.driverLocation.ingestPing(user.sub, parsed.data);
  }

  private async authenticate(client: Socket): Promise<JwtPayload> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      this.tokenFromCookie(client.handshake.headers.cookie);
    if (!token) throw new Error('no token');
    const raw = await this.jwt.verifyAsync(token, {
      secret: this.config.get('jwt.accessSecret'),
    });
    return jwtPayloadSchema.parse(raw);
  }

  private tokenFromCookie(cookieHeader?: string): string | undefined {
    if (!cookieHeader) return undefined;
    const cookies = parseCookie(cookieHeader.replaceAll('; ', '&'));
    return cookies['mrb_access'] as string | undefined;
  }
}
