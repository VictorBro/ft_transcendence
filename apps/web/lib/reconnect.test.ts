import { describe, expect, it, vi } from 'vitest';

import { afterConnectError, afterDisconnect, apiIsUp, backoffMs } from './reconnect';

function respondWith(body: string): typeof fetch {
  return vi.fn(
    async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

describe('backoffMs', () => {
  it('doubles from 1 s and stops at 10 s', () => {
    const middle = () => 0.5;
    expect([0, 1, 2, 3, 4, 5].map((attempt) => backoffMs(attempt, middle))).toEqual([
      1_000, 2_000, 4_000, 8_000, 10_000, 10_000,
    ]);
  });

  it('spreads each wait by a quarter either way', () => {
    expect(backoffMs(1, () => 0)).toBe(1_500);
    expect(backoffMs(1, () => 1)).toBe(2_500);
  });

  /** 2 ** 1024 is Infinity: a tab left on a dead API for hours still waits 10 s. */
  it('stays at the cap however long the outage lasts', () => {
    expect(backoffMs(2_000, () => 0.5)).toBe(10_000);
  });
});

describe('afterDisconnect', () => {
  it('does nothing when the tab closed the socket itself', () => {
    expect(afterDisconnect('io client disconnect')).toBe('stay');
  });

  it('retries once, quietly, when the server closed it', () => {
    expect(afterDisconnect('io server disconnect')).toBe('retryQuietly');
  });

  it.each(['transport close', 'transport error', 'ping timeout'])(
    'reconnects after %s',
    (reason) => {
      expect(afterDisconnect(reason)).toBe('reconnect');
    },
  );
});

describe('afterConnectError', () => {
  it('reads a refused handshake as signed out', () => {
    expect(afterConnectError(false, 'auth.sessionRequired')).toBe('signedOut');
  });

  it('reconnects after a dial that failed on the way', () => {
    expect(afterConnectError(true, 'websocket error')).toBe('reconnect');
  });

  /** A database hiccup during the handshake says nothing about the session. */
  it('reconnects after any other refusal', () => {
    expect(afterConnectError(false, 'server.unexpected')).toBe('reconnect');
  });
});

describe('apiIsUp', () => {
  it('is true when web says the API answers', async () => {
    await expect(apiIsUp(respondWith('{"api":"up"}'))).resolves.toBe(true);
  });

  it('is false when web says it does not', async () => {
    await expect(apiIsUp(respondWith('{"api":"down"}'))).resolves.toBe(false);
  });

  /** A proxy error page, for one, is not the probe's answer. */
  it('is false on a body it does not recognise', async () => {
    await expect(apiIsUp(respondWith('<html>502</html>'))).resolves.toBe(false);
    await expect(apiIsUp(respondWith('{"api":"maybe"}'))).resolves.toBe(false);
  });

  it('is false when the request itself fails', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    await expect(apiIsUp(offline)).resolves.toBe(false);
  });

  it('asks the web route, never a cached answer', async () => {
    const fetchImpl = respondWith('{"api":"up"}');
    await apiIsUp(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('/healthz/api', { cache: 'no-store' });
  });
});
