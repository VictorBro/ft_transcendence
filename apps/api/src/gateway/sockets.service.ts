import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import {
  userRoom,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerEventName,
  type ServerToClientEvents,
  type SocketData,
} from '@ft/shared';

import { wsEvents } from '../metrics/metrics';

export type SocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/** Private to the API: the browser never needs to name a session. */
export const sessionRoom = (sessionId: string): string => `session:${sessionId}`;

/**
 * How the rest of the API reaches a browser. It can only address one user, so
 * nothing can broadcast to everyone by mistake.
 */
@Injectable()
export class SocketsService {
  private server?: SocketServer;

  /** By the gateway once socket.io is up. Outside Nest (the seed) it never is, and emits go nowhere. */
  attach(server: SocketServer): void {
    this.server = server;
  }

  toUser<E extends ServerEventName>(
    userId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    if (!this.server) return;
    this.server.to(userRoom(userId)).emit(event, ...args);
    wsEvents.inc({ direction: 'out', event, outcome: 'ok' });
  }

  /** Every socket opened with this session id: the session has ended or been replaced. */
  closeSession(sessionId: string): void {
    this.server?.in(sessionRoom(sessionId)).disconnectSockets(true);
  }
}
