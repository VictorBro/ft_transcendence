import { describe, expect, it, vi } from 'vitest';

import {
  buildApiUrl,
  DEFAULT_API_INTERNAL_URL,
  describeFetchError,
  fetchSession,
  HEALTH_PATH,
  pingApi,
  resolveApiBaseUrl,
  SESSION_PATH,
} from './api';

describe('resolveApiBaseUrl', () => {
  it('falls back to the compose service name when unset', () => {
    expect(resolveApiBaseUrl(undefined)).toBe(DEFAULT_API_INTERNAL_URL);
  });

  it('falls back when the value is blank', () => {
    expect(resolveApiBaseUrl('   ')).toBe(DEFAULT_API_INTERNAL_URL);
  });

  it('trims surrounding whitespace and trailing slashes', () => {
    expect(resolveApiBaseUrl('  http://api:3001//  ')).toBe('http://api:3001');
  });

  it('keeps a non-default host untouched', () => {
    expect(resolveApiBaseUrl('http://localhost:3001')).toBe('http://localhost:3001');
  });
});

describe('buildApiUrl', () => {
  it('joins base and path', () => {
    expect(buildApiUrl('http://api:3001', SESSION_PATH)).toBe('http://api:3001/api/auth/me');
  });

  it('adds the missing leading slash', () => {
    expect(buildApiUrl('http://api:3001', 'api/health')).toBe('http://api:3001/api/health');
  });

  it('never produces a double slash', () => {
    expect(buildApiUrl('http://api:3001/', HEALTH_PATH)).toBe('http://api:3001/api/health');
  });
});

describe('describeFetchError', () => {
  it('names a timeout', () => {
    const error = new Error('aborted');
    error.name = 'TimeoutError';
    expect(describeFetchError(error)).toBe('the request timed out');
  });

  it('passes through an error message', () => {
    expect(describeFetchError(new Error('ECONNREFUSED'))).toBe('ECONNREFUSED');
  });

  it('handles a thrown non-error', () => {
    expect(describeFetchError('boom')).toBe('an unknown network error occurred');
  });
});

describe('fetchSession', () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'learner@example.com',
    displayName: 'learner',
    avatarUrl: null,
    locale: 'en',
    role: 'USER',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('returns the signed-in user and forwards the cookie', async () => {
    const fetchImpl = vi.fn(async () => Response.json(user));

    await expect(fetchSession({ cookie: 'ft.sid=abc', fetchImpl })).resolves.toEqual({
      status: 'ok',
      user,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api:3001/api/auth/me',
      expect.objectContaining({ headers: expect.objectContaining({ cookie: 'ft.sid=abc' }) }),
    );
  });

  // The API keys anonymous callers on the address it sees, and what it sees
  // here is the web container unless this header carries the real one.
  it('forwards the visitor address when given one', async () => {
    const fetchImpl = vi.fn(async () => Response.json(user));

    await fetchSession({ forwardedFor: '88.10.20.30', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-forwarded-for': '88.10.20.30' }),
      }),
    );
  });

  it('omits the cookie header entirely when there is none', async () => {
    const fetchImpl = vi.fn(async () => Response.json(user));

    await fetchSession({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });

  // 401 is the ordinary signed-out answer, not an error worth a 500.
  it('reads a 401 as signed out', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));

    await expect(fetchSession({ fetchImpl })).resolves.toEqual({ status: 'signed-out' });
  });

  // Throttling says "ask again later", never "you are not signed in". Reading
  // it as a logout is what sent signed-in visitors back to /login.
  it('reads a 429 as unavailable, not signed out', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429 }));

    await expect(fetchSession({ fetchImpl })).resolves.toMatchObject({
      status: 'unavailable',
    });
  });

  it('reads a 500 as unavailable, not signed out', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

    await expect(fetchSession({ fetchImpl })).resolves.toMatchObject({
      status: 'unavailable',
    });
  });

  // A 200 with a body we cannot read is not a verdict on the session: the API
  // never said this visitor is signed out, so we must not say it either.
  it('reads an unreadable payload as unavailable', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: 'not-a-uuid' }));

    await expect(fetchSession({ fetchImpl })).resolves.toMatchObject({
      status: 'unavailable',
    });
  });

  it('reads an unreachable API as unavailable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    await expect(fetchSession({ fetchImpl })).resolves.toMatchObject({
      status: 'unavailable',
    });
  });
});

describe('pingApi', () => {
  it('calls the API health endpoint', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ status: 'ok' }));

    await expect(pingApi({ fetchImpl })).resolves.toEqual({ status: 'ok' });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${DEFAULT_API_INTERNAL_URL}${HEALTH_PATH}`,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  // The question is whether the hop exists, not whether the API is happy.
  // Answering "unreachable" for a rate-limited or erroring API would report a
  // healthy container as down, and /api/health already covers the other half.
  it('treats any HTTP answer as reachable', async () => {
    for (const status of [429, 500, 503]) {
      const fetchImpl = vi.fn(async () => new Response(null, { status }));
      await expect(pingApi({ fetchImpl })).resolves.toEqual({ status: 'ok' });
    }
  });

  it('reports a connection failure as unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    await expect(pingApi({ fetchImpl })).resolves.toEqual({
      status: 'unreachable',
      reason: 'ECONNREFUSED',
    });
  });
});
