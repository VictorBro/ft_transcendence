import { z } from 'zod';

/**
 * The tab socket's rules, kept pure so they can be tested here: the socket
 * itself (components/tab-socket.ts) needs a browser.
 */

export type SocketStatus = 'closed' | 'connected' | 'reconnecting' | 'signedOut';
export type NextStep = 'stay' | 'retryQuietly' | 'reconnect' | 'signedOut';

export const RETRY_FIRST_MS = 1_000;
export const RETRY_MAX_MS = 10_000;

/** 1, 2, 4, 8, then 10 s, each spread by a quarter so tabs do not dial in step. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  return Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** attempt) * (0.75 + random() / 2);
}

/**
 * The server closing the socket means the session ended or was replaced: one
 * quiet retry lets the handshake tell which. We closed it: nothing to do.
 * Anything else is a lost connection.
 */
export function afterDisconnect(reason: string): NextStep {
  if (reason === 'io client disconnect') return 'stay';
  if (reason === 'io server disconnect') return 'retryQuietly';
  return 'reconnect';
}

/**
 * A refused handshake is the one sign the session is over. socket.io marks it
 * by leaving the socket inactive; a dial that failed on the way stays active.
 */
export function afterConnectError(active: boolean, message: string): NextStep {
  return !active && message === 'auth.sessionRequired' ? 'signedOut' : 'reconnect';
}

const ProbeSchema = z.object({ api: z.enum(['up', 'down']) });

/** Asks web, which always answers 200, so the probe itself is never a console error. */
export async function apiIsUp(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl('/healthz/api', { cache: 'no-store' });
    return ProbeSchema.safeParse(await response.json()).data?.api === 'up';
  } catch {
    return false;
  }
}
