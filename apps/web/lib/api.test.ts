import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [{ name: 'ft.sid', value: 'abc' }] }),
  headers: async () => ({ get: () => '88.10.20.30' }),
}));

import {
  buildApiUrl,
  DEFAULT_API_INTERNAL_URL,
  DEFAULT_TIMEOUT_MS,
  describeFetchError,
  fetchSession,
  apiGet,
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
      data: user,
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

  it('reads a 204 as unavailable with an empty payload message', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(fetchSession({ fetchImpl })).resolves.toEqual({
      status: 'unavailable',
      reason: 'the API returned an empty payload',
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

  it('reads malformed JSON as unavailable, not signed out', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('{invalid-json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await expect(fetchSession({ fetchImpl })).resolves.toMatchObject({
      status: 'unavailable',
    });
  });

  it('reads a timeout as unavailable and applies the configured timeout', async () => {
    const timeoutError = new DOMException('Timed out', 'TimeoutError');
    const controller = new AbortController();
    controller.abort(timeoutError);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return Response.json(user);
    });

    try {
      await expect(fetchSession({ fetchImpl, timeoutMs: 25 })).resolves.toEqual({
        status: 'unavailable',
        reason: 'the request timed out',
      });
      expect(timeout).toHaveBeenCalledWith(25);
      expect(fetchImpl).toHaveBeenCalledWith(
        'http://api:3001/api/auth/me',
        expect.objectContaining({ signal: controller.signal }),
      );
    } finally {
      timeout.mockRestore();
    }
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

describe('apiGet', () => {
  it.each([
    ['/api/users', {}, 'http://api:3001/api/users'],
    [
      '/api/users',
      { search: 'alice smith', page: '2' },
      'http://api:3001/api/users?search=alice+smith&page=2',
    ],
    ['/api/users', { page: '2', sort: 'name' }, 'http://api:3001/api/users?page=2&sort=name'],
  ])('builds the query for %s with %j', async (path, params, expectedUrl) => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ name: 'Alice' }));
    try {
      await expect(apiGet(z.object({ name: z.string() }), path, params)).resolves.toEqual({
        status: 'ok',
        data: { name: 'Alice' },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            cookie: 'ft.sid=abc',
            'x-forwarded-for': '88.10.20.30',
          },
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('rejects paths containing query parameters', async () => {
    await expect(apiGet(z.object({ name: z.string() }), '/api/users?page=1')).resolves.toEqual({
      status: 'unavailable',
      reason: 'the path must not contain query parameters',
    });
  });

  it('supports async schema refinements', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json('Alice'));
    try {
      const schema = z.string().refine(async (value) => value === 'Alice');
      await expect(apiGet(schema, '/api/name')).resolves.toEqual({ status: 'ok', data: 'Alice' });
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('server GET failure results', () => {
  it.each([
    [401, 'signed-out'],
    [500, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, expectedStatus) => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status }));
    try {
      await expect(apiGet(z.object({ name: z.string() }), '/api/users')).resolves.toMatchObject({
        status: expectedStatus,
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it.each([
    ['invalid JSON', () => new Response('{broken', { status: 200 })],
    ['invalid payload', () => Response.json({ name: 42 })],
  ])('treats %s as unavailable', async (_label, response) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
    try {
      await expect(apiGet(z.object({ name: z.string() }), '/api/users')).resolves.toMatchObject({
        status: 'unavailable',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('uses API_INTERNAL_URL and the default timeout while forwarding request headers', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://internal-api:3001');
    const controller = new AbortController();
    controller.abort(new DOMException('Timed out', 'TimeoutError'));
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      init?.signal?.throwIfAborted();
      return Response.json({ name: 'Alice' });
    });
    try {
      await expect(apiGet(z.object({ name: z.string() }), '/api/users')).resolves.toEqual({
        status: 'unavailable',
        reason: 'the request timed out',
      });
      expect(timeout).toHaveBeenCalledWith(DEFAULT_TIMEOUT_MS);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://internal-api:3001/api/users',
        expect.objectContaining({
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            cookie: 'ft.sid=abc',
            'x-forwarded-for': '88.10.20.30',
          },
        }),
      );
    } finally {
      fetchMock.mockRestore();
      timeout.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
