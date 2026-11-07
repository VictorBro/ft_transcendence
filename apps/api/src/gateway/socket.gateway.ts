import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Request } from 'express';
import type { Event, ExtendedError } from 'socket.io';
import { SERVER_EVENTS, clientEventSchema, userRoom, type ErrorCode } from '@ft/shared';

import { SESSION_KEY_PREFIX } from '../app.setup';
import { wsConnections, wsEvents } from '../metrics/metrics';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { activeDay } from '../users/active-day';
import { SocketsService, sessionRoom, type AppSocket, type SocketServer } from './sockets.service';

/** Caddy sends /ws and /ws/* to the api, in dev and in prod. */
export const SOCKET_PATH = '/ws';
export const EVENT_LIMIT = 20;
/** Sockets one session may hold: one per tab, and nobody keeps 20 tabs of the app open. */
export const SESSION_SOCKET_LIMIT = 20;
export const EVENT_WINDOW_MS = 10_000;
const SWEEP_MS = 60_000;

/** How many events this window has seen, this one included. */
export function fixedWindow(windowMs: number, now: () => number = Date.now): () => number {
  let start = now();
  let count = 0;
  return () => {
    if (now() - start >= windowMs) {
      start = now();
      count = 0;
    }
    return ++count;
  };
}

/**
 * Same-site is not same-origin: a page on a sibling subdomain sends our Lax
 * cookie too. Browsers always send Origin on a WebSocket; a client without one
 * is not a browser and holds the cookie itself.
 */
export function sameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // "null" and other junk
  }
}

@WebSocketGateway({
  path: SOCKET_PATH,
  serveClient: false,
  // One transport: the handshake is a single upgrade and nothing long-polls.
  transports: ['websocket'],
  // Events are small; socket.io's 1 MB default would let 20 events be 20 MB of zod input.
  maxHttpBufferSize: 16_384,
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer() private server!: SocketServer;
  private readonly logger = new Logger(SocketGateway.name);
  private sweep?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sockets: SocketsService,
  ) {}

  afterInit(server: SocketServer): void {
    // A middleware, not handleConnection: a refused socket never connects, and
    // the browser gets a CONNECT_ERROR it does not log rather than an HTTP 401 it would.
    server.use((socket, next) => void this.authenticate(socket, next));
    this.sockets.attach(server);
    this.sweep = setInterval(() => void this.closeEndedSessions(), SWEEP_MS).unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweep);
  }

  async authenticate(socket: AppSocket, next: (error?: ExtendedError) => void): Promise<void> {
    const rooms: string[] = [];
    try {
      const { origin, host } = socket.handshake.headers;
      if (!sameOrigin(origin, host)) {
        next(new Error('auth.sessionRequired'));
        return;
      }
      // SessionIoAdapter ran express-session on this request.
      const { session, sessionID } = socket.request as Request;
      const userId = session?.userId;
      if (!userId) {
        next(new Error('auth.sessionRequired'));
        return;
      }
      // Before the write, so a client opening sockets in a loop costs no query,
      // and the per-socket event limit cannot be multiplied without bound.
      if (
        (socket.nsp.adapter.rooms.get(sessionRoom(sessionID))?.size ?? 0) >= SESSION_SOCKET_LIMIT
      ) {
        next(new Error('server.rateLimited'));
        return;
      }
      // Like AuthGuard: a deleted account is refused although its session lives.
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { lastActiveDay: true },
      });
      if (user === null) {
        next(new Error('auth.sessionRequired'));
        return;
      }
      // The day only, so the first tab of the day writes and the others just read.
      const today = activeDay(new Date());
      if (user.lastActiveDay?.getTime() !== today.getTime()) {
        await this.prisma.user.update({ where: { id: userId }, data: { lastActiveDay: today } });
      }
      socket.data = { userId, sessionId: sessionID };
      // Before next(): the client's CONNECT ack then means it is in the room.
      rooms.push(userRoom(userId), sessionRoom(sessionID));
      await socket.join(rooms);
      // A logout between the session middleware and the join closed the room
      // before this socket was in it. Asked after the join, the session is
      // either still here, or gone and the socket leaves: no window left.
      if ((await this.redis.client.exists(`${SESSION_KEY_PREFIX}${sessionID}`)) === 0) {
        this.leave(socket, rooms);
        next(new Error('auth.sessionRequired'));
        return;
      }
      next();
    } catch (error) {
      this.leave(socket, rooms);
      this.logger.error(`handshake failed: ${String(error)}`);
      next(new Error('server.unexpected'));
    }
  }

  /** A refused socket never connects, so nothing else takes it out of its rooms. */
  private leave(socket: AppSocket, rooms: string[]): void {
    for (const room of rooms) void socket.leave(room);
  }

  handleConnection(socket: AppSocket): void {
    wsConnections.inc();
    const seen = fixedWindow(EVENT_WINDOW_MS);
    socket.use((packet, next) => this.screen(socket, packet, next, seen()));
  }

  handleDisconnect(): void {
    wsConnections.dec();
  }

  /**
   * Every client event passes here before any handler. Never next(err): socket.io
   * re-emits it as an `error` event, which crashes the process when nobody listens.
   */
  private screen(socket: AppSocket, packet: Event, next: () => void, seen: number): void {
    const [name, payload] = packet;
    const schema = clientEventSchema(name);
    const event = schema ? name : 'unknown';
    try {
      if (seen > EVENT_LIMIT) {
        // Told once a window, so a flood is not answered with one.
        if (seen === EVENT_LIMIT + 1) this.reply(socket, 'server.rateLimited');
        wsEvents.inc({ direction: 'in', event, outcome: 'rate_limited' });
        return;
      }
      const parsed = schema?.safeParse(payload);
      if (!parsed?.success) {
        this.reply(socket, 'request.invalid');
        wsEvents.inc({ direction: 'in', event, outcome: 'invalid' });
        return;
      }
      packet[1] = parsed.data;
      wsEvents.inc({ direction: 'in', event, outcome: 'ok' });
      next();
    } catch (error) {
      this.logger.error(`event ${event} failed: ${String(error)}`);
      this.reply(socket, 'server.unexpected');
    }
  }

  /** To the offending socket only: an answer, not a broadcast. */
  private reply(socket: AppSocket, code: ErrorCode): void {
    socket.emit(SERVER_EVENTS.APP_ERROR, { code });
    wsEvents.inc({ direction: 'out', event: SERVER_EVENTS.APP_ERROR, outcome: 'ok' });
  }

  /**
   * Redis expires an idle session without telling anyone, and its sockets would
   * outlive it. Known keys only, never a scan.
   */
  async closeEndedSessions(): Promise<void> {
    const ids = new Set([...this.server.sockets.sockets.values()].map((s) => s.data.sessionId));
    try {
      for (const id of ids) {
        if ((await this.redis.client.exists(`${SESSION_KEY_PREFIX}${id}`)) === 0) {
          this.sockets.closeSession(id);
        }
      }
    } catch (error) {
      // Redis unreachable is not a session ending: the next round asks again.
      this.logger.warn(`session sweep skipped: ${String(error)}`);
    }
  }
}
