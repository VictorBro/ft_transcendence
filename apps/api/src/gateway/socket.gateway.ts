import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type GatewayMetadata,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Request } from 'express';
import type { Event, ExtendedError } from 'socket.io';
import type { ZodError } from 'zod';
import {
  SERVER_EVENTS,
  clientEventSchema,
  isErrorCode,
  userRoom,
  type ErrorCode,
  type PresenceStatus,
  type PresenceUpdate,
  type SocketAck,
} from '@ft/shared';

import { SESSION_KEY_PREFIX } from '../app.setup';
import { friendIds } from '../friends/friend-ids';
import { unreadCounts } from '../messages/unread';
import { wsConnections, wsEvents } from '../metrics/metrics';
import { PresenceService } from '../presence/presence.service';
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

/** The payload of presence:update, stamped now. */
function presenceUpdate(userId: string, status: PresenceStatus): PresenceUpdate {
  return { userId, status, at: new Date().toISOString() };
}

/** The first rule's code, as CodeValidationPipe answers a body; Zod's own sentences are not codes. */
function issueCode(error: ZodError | undefined): ErrorCode {
  const message = error?.issues[0]?.message;
  return message !== undefined && isErrorCode(message) ? message : 'request.invalid';
}

/** socket.io's callback, the last argument of an event the client sent with one. */
export type Ack = (answer: SocketAck<never>) => void;

/**
 * Says no to an event. Its ack when it came with one, since the caller is
 * waiting on it; otherwise app:error to that socket only, never a broadcast.
 */
export function refuse(socket: AppSocket, ack: Ack | undefined, code: ErrorCode): void {
  if (ack) {
    ack({ ok: false, code });
    return;
  }
  socket.emit(SERVER_EVENTS.APP_ERROR, { code });
  wsEvents.inc({ direction: 'out', event: SERVER_EVENTS.APP_ERROR, outcome: 'ok' });
}

/** Every gateway's: they share one server, and Nest warns when their options differ. */
export const GATEWAY_OPTIONS = {
  path: SOCKET_PATH,
  serveClient: false,
  // One transport: the handshake is a single upgrade and nothing long-polls.
  transports: ['websocket'],
  // Events are small; socket.io's 1 MB default would let 20 events be 20 MB of zod input.
  maxHttpBufferSize: 16_384,
} satisfies GatewayMetadata;

@WebSocketGateway(GATEWAY_OPTIONS)
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
    private readonly presence: PresenceService,
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
    const windows = new Map<string, () => number>();
    socket.use((packet, next) => this.screen(socket, packet, next, windows));
    void this.arrived(socket);
  }

  handleDisconnect(socket: AppSocket): void {
    wsConnections.dec();
    void this.left(socket.data.userId);
  }

  /**
   * Tells the friends when this is the user's first socket, and tells this
   * socket where each friend stands and what is unread: the page may have been
   * rendered a moment before a friend came or went, or a message arrived.
   */
  private async arrived(socket: AppSocket): Promise<void> {
    const { userId } = socket.data;
    // Started with the rest, settled on its own: a failed count must not keep
    // the friends from hearing this user came online.
    const unread = unreadCounts(this.prisma, userId).catch((error: unknown) => {
      this.logger.error(`unread on connect failed: ${String(error)}`);
      return undefined;
    });
    try {
      // Both start before any await. A socket that closes at once is fine
      // either way: its DECR only lands after the grace period.
      const [first, friends] = await Promise.all([
        this.presence.connected(userId),
        friendIds(this.prisma, userId),
      ]);
      if (first) this.tellFriends(friends, userId, 'online');
      const online = await this.presence.isOnline(friends);
      for (const friend of friends) {
        const status = online.has(friend) ? 'online' : 'offline';
        socket.emit(SERVER_EVENTS.PRESENCE_UPDATE, presenceUpdate(friend, status));
        wsEvents.inc({ direction: 'out', event: SERVER_EVENTS.PRESENCE_UPDATE, outcome: 'ok' });
      }
    } catch (error) {
      this.logger.error(`presence on connect failed: ${String(error)}`);
    }
    // Last, so a socket that has it has heard the rest of the snapshot. Sent
    // when empty too: the tab can tell "nothing unread" from "not heard yet".
    const counts = await unread;
    if (counts) {
      socket.emit(SERVER_EVENTS.DM_UNREAD, counts);
      wsEvents.inc({ direction: 'out', event: SERVER_EVENTS.DM_UNREAD, outcome: 'ok' });
    }
  }

  /** After the grace period, tells the friends if no tab came back. */
  private async left(userId: string): Promise<void> {
    try {
      if (!(await this.presence.disconnected(userId))) return;
      // Asked now, not on connect: a friendship may have begun or ended since.
      this.tellFriends(await friendIds(this.prisma, userId), userId, 'offline');
    } catch (error) {
      this.logger.error(`presence on disconnect failed: ${String(error)}`);
    }
  }

  /** To each friend's room: all their tabs, and no one else. */
  private tellFriends(friends: string[], userId: string, status: PresenceStatus): void {
    const update = presenceUpdate(userId, status);
    for (const friend of friends) {
      this.sockets.toUser(friend, SERVER_EVENTS.PRESENCE_UPDATE, update);
    }
  }

  /**
   * Every client event passes here before any handler. Never next(err): socket.io
   * re-emits it as an `error` event, which crashes the process when nobody listens.
   */
  private screen(
    socket: AppSocket,
    packet: Event,
    next: () => void,
    windows: Map<string, () => number>,
  ): void {
    const [name, ...args] = packet;
    const ack: Ack | undefined = typeof args.at(-1) === 'function' ? args.pop() : undefined;
    const schema = clientEventSchema(name);
    const event = schema ? name : 'unknown';
    // A window per event, so reads never spend the budget for sends. Unknown
    // events share one: a new name is not a new budget.
    let counter = windows.get(event);
    if (counter === undefined) {
      counter = fixedWindow(EVENT_WINDOW_MS);
      windows.set(event, counter);
    }
    const seen = counter();
    try {
      if (seen > EVENT_LIMIT) {
        // Told once a window, so a flood is not answered with one. An ack is
        // answered every time: its caller is waiting on it.
        if (ack || seen === EVENT_LIMIT + 1) refuse(socket, ack, 'server.rateLimited');
        wsEvents.inc({ direction: 'in', event, outcome: 'rate_limited' });
        return;
      }
      // One payload: Nest hands a handler any extra arguments as an array in its place.
      const parsed = args.length === 1 ? schema?.safeParse(args[0]) : undefined;
      if (!parsed?.success) {
        refuse(socket, ack, issueCode(parsed?.error));
        wsEvents.inc({ direction: 'in', event, outcome: 'invalid' });
        return;
      }
      packet[1] = parsed.data;
      wsEvents.inc({ direction: 'in', event, outcome: 'ok' });
      next();
    } catch (error) {
      this.logger.error(`event ${event} failed: ${String(error)}`);
      refuse(socket, ack, 'server.unexpected');
    }
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
