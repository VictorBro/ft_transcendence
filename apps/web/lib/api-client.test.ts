import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TwoFactorStatusSchema, SessionUserSchema } from '@ft/shared';
import { send, clientGet, clientPost, clientPut, clientPatch, clientDelete } from './api-client';

afterEach(() => vi.unstubAllGlobals());

describe('clientGet', () => {
  it('validates two-factor status and sends browser credentials', async () => {
    const body = { enabled: true, enrolmentPending: false, recoveryCodesRemaining: 4 };
    const fetchMock = vi.fn(async () => Response.json(body));
    vi.stubGlobal('fetch', fetchMock);
    await expect(clientGet(TwoFactorStatusSchema, '/api/auth/2fa')).resolves.toEqual({
      ok: true,
      data: body,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/2fa',
      expect.objectContaining({
        credentials: 'same-origin',
      }),
    );
  });

  it('rejects a payload that does not match the endpoint schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ enabled: 'yes' })),
    );
    await expect(clientGet(TwoFactorStatusSchema, '/api/auth/2fa')).resolves.toEqual({
      ok: false,
      code: 'server.unexpected',
      status: 200,
    });
  });

  it('rejects malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{broken', { status: 200 })),
    );
    await expect(clientGet(TwoFactorStatusSchema, '/api/auth/2fa')).resolves.toEqual({
      ok: false,
      code: 'server.unexpected',
      status: 200,
    });
  });

  it.each([401, 500])('preserves error codes and status for HTTP %i', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'auth.invalidCredentials' }, { status })),
    );
    await expect(clientGet(SessionUserSchema, '/api/auth/me')).resolves.toEqual({
      ok: false,
      code: 'auth.invalidCredentials',
      status,
    });
  });

  it('reports network failure as a code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(clientGet(TwoFactorStatusSchema, '/api/auth/2fa')).resolves.toEqual({
      ok: false,
      code: 'network.unreachable',
      status: 0,
    });
  });

  it('accepts HTTP 204 only when the schema accepts undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(clientPost(z.void(), '/api/auth/logout')).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    await expect(clientGet(SessionUserSchema, '/api/auth/me')).resolves.toEqual({
      ok: false,
      code: 'server.unexpected',
      status: 204,
    });
  });

  it('supports schema transformations and async validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json('42')),
    );
    const schema = z
      .string()
      .refine(async (value) => value === '42')
      .transform(Number);
    await expect(clientGet(schema, '/api/value')).resolves.toEqual({ ok: true, data: 42 });
  });
});

describe('send query parameters', () => {
  it.each([
    ['/api/users', {}, '/api/users'],
    ['/api/users', { search: 'alice & bob', page: '2' }, '/api/users?search=alice+%26+bob&page=2'],
  ])('appends encoded query parameters for %s with %j', async (path, params, expected) => {
    const fetchMock = vi.fn(async () => Response.json('ok'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(clientGet(z.string(), path, params)).resolves.toEqual({
      ok: true,
      data: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledWith(expected, expect.objectContaining({ method: 'GET' }));
  });
});

describe('clientPost', () => {
  it.each([
    ['POST', clientPost],
    ['PUT', clientPut],
    ['PATCH', clientPatch],
    ['DELETE', clientDelete],
  ] as const)('serializes raw data for %s', async (method, request) => {
    const fetchMock = vi.fn(async () => Response.json('ok'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      request(z.string(), '/api/resource', { name: 'Alice' }, { page: '2' }),
    ).resolves.toEqual({
      ok: true,
      data: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/resource?page=2',
      expect.objectContaining({
        method,
        body: '{"name":"Alice"}',
        credentials: 'same-origin',
      }),
    );
  });

  it('serializes string data as JSON too', async () => {
    const fetchMock = vi.fn(async () => Response.json('ok'));
    vi.stubGlobal('fetch', fetchMock);
    await clientPost(z.string(), '/api/resource', 'hello');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/resource',
      expect.objectContaining({ body: '"hello"' }),
    );
  });
});

describe('send headers', () => {
  it.each([
    ['record', { Authorization: 'Bearer token', Accept: 'text/plain' }],
    ['Headers instance', new Headers({ Authorization: 'Bearer token', Accept: 'text/plain' })],
    [
      'tuple array',
      [
        ['Authorization', 'Bearer token'],
        ['Accept', 'text/plain'],
      ],
    ],
  ] satisfies [string, HeadersInit][])(
    'merges %s headers without mutating the input',
    async (_label, input) => {
      const original = Array.from(new Headers(input).entries());
      const fetchMock = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
        const requestHeaders = new Headers(init?.headers);
        expect(requestHeaders.get('authorization')).toBe('Bearer token');
        expect(requestHeaders.get('accept')).toBe('text/plain');
        expect(requestHeaders.get('content-type')).toBe('application/json');
        return Response.json('ok');
      });
      vi.stubGlobal('fetch', fetchMock);
      await expect(send(z.string(), '/api/test', { headers: input })).resolves.toEqual({
        ok: true,
        data: 'ok',
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(Array.from(new Headers(input).entries())).toEqual(original);
    },
  );

  it('keeps default headers when none are supplied', async () => {
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      const requestHeaders = new Headers(init?.headers);
      expect(requestHeaders.get('accept')).toBe('application/json');
      expect(requestHeaders.get('content-type')).toBe('application/json');
      return Response.json('ok');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(send(z.string(), '/api/test')).resolves.toEqual({ ok: true, data: 'ok' });
  });
});
