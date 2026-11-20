import { z } from 'zod';
import {
  CLIENT_EVENTS,
  ERROR_CODES,
  MessageSchema,
  type DmSend,
  type Message,
  type SocketAck,
} from '@ft/shared';

/**
 * dm:send and its ack, kept here so they can be tested with a fake socket: the
 * tab's own (components/tab-socket.ts) needs a browser.
 */

/** How long a send waits for the server to say it stored the message. */
export const SEND_TIMEOUT_MS = 10_000;

/** What a send needs of the tab's socket. */
export interface SendSocket {
  readonly connected: boolean;
  timeout(ms: number): {
    emitWithAck(event: typeof CLIENT_EVENTS.DM_SEND, payload: DmSend): Promise<unknown>;
  };
}

const AckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: MessageSchema }),
  z.object({ ok: z.literal(false), code: z.enum(ERROR_CODES) }),
]);

const UNREACHABLE = { ok: false, code: 'network.unreachable' } as const;

/**
 * The stored message, or a code. Refused at once while not connected:
 * socket.io would hold the send and deliver it on reconnect, long after the
 * thread said it failed.
 */
export async function sendMessageOver(
  socket: SendSocket,
  userId: string,
  text: string,
): Promise<SocketAck<Message>> {
  if (!socket.connected) return UNREACHABLE;

  let answer: unknown;
  try {
    answer = await socket
      .timeout(SEND_TIMEOUT_MS)
      .emitWithAck(CLIENT_EVENTS.DM_SEND, { userId, text });
  } catch {
    // Timed out, or the socket closed first. The server may have stored it
    // all the same, and sending it again then shows it twice: accepted, since
    // nothing tells two sends of the same text apart.
    return UNREACHABLE;
  }

  const parsed = AckSchema.safeParse(answer);
  if (!parsed.success) return { ok: false, code: 'unknown' };
  // Errors.server.unexpected words an HTTP status, which a socket does not have.
  if (!parsed.data.ok && parsed.data.code === 'server.unexpected') {
    return { ok: false, code: 'unknown' };
  }
  return parsed.data;
}
