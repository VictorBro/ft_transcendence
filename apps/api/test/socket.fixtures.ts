import { io, type Socket as ClientSocket } from 'socket.io-client';
import type { Response } from 'supertest';

export type { ClientSocket };

/** The `ft.sid=...` pair from a response, as a browser would send it back. */
export const sessionCookie = (res: Response): string => {
  const [cookie] = res.headers['set-cookie'] as unknown as string[];
  return cookie.split(';')[0];
};

/** A socket to the gateway as the browser opens it: websocket only, the cookie the only credential. */
export function connect(
  port: number,
  cookie?: string,
  headers: Record<string, string> = {},
): ClientSocket {
  return io(`http://127.0.0.1:${port}`, {
    path: '/ws',
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: { ...(cookie ? { cookie } : {}), ...headers },
  });
}

/** Resolves with the next `event`, rejects after `ms`. */
export function nextEvent<T>(socket: ClientSocket, event: string, ms = 5_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`no ${event} within ${ms} ms`));
    }, ms);
    function onEvent(payload: T): void {
      clearTimeout(timer);
      resolve(payload);
    }
    socket.once(event, onEvent);
  });
}

/** Resolves once the gateway let the socket in: the server joined its rooms before this. */
export function connected(socket: ClientSocket): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve(socket);
      return;
    }
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(new Error(`refused: ${error.message}`)));
  });
}

/** Resolves with the reason the gateway refused the socket. */
export async function refusal(socket: ClientSocket): Promise<string> {
  return (await nextEvent<Error>(socket, 'connect_error')).message;
}

/** Every payload of `event` from now on, in order. */
export function collect<T>(socket: ClientSocket, event: string): T[] {
  const seen: T[] = [];
  socket.on(event, (payload: T) => seen.push(payload));
  return seen;
}
