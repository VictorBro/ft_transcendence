import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkTutor, loadTutorInfo } from './tutor-client';

const working = {
  provider: 'gemini',
  model: 'gemini-3.6-flash',
  status: 'ok',
  latencyMs: 171,
  httpStatus: 200,
  retryAt: null,
  checkedAt: '2026-11-27T10:00:00.000Z',
};

function respondWith(status: number, body: unknown = null): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadTutorInfo', () => {
  it('gets the provider and the model, with the session cookie', async () => {
    const fetchMock = respondWith(200, { provider: 'fixture', model: null });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadTutorInfo()).resolves.toEqual({
      ok: true,
      data: { provider: 'fixture', model: null },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tutor',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
  });
});

describe('checkTutor', () => {
  it('posts with no body and returns the verdict', async () => {
    const fetchMock = respondWith(200, working);
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkTutor()).resolves.toEqual({ ok: true, data: working });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tutor/check',
      expect.objectContaining({ method: 'POST', body: undefined }),
    );
  });

  // Over today's quota: the page names when Google said it comes back.
  it('returns the time Google gave with a quota refusal', async () => {
    const refused = {
      ...working,
      status: 'quota_day',
      httpStatus: 429,
      retryAt: '2026-11-28T08:00:00.000Z',
    };
    vi.stubGlobal('fetch', respondWith(200, refused));

    await expect(checkTutor()).resolves.toEqual({ ok: true, data: refused });
  });

  // The route allows 3 checks a minute per account.
  it('reports the rate limit as a code', async () => {
    vi.stubGlobal('fetch', respondWith(429, { message: 'server.rateLimited' }));

    await expect(checkTutor()).resolves.toEqual({
      ok: false,
      code: 'server.rateLimited',
      status: 429,
    });
  });

  // A status the page has no sentence for must not reach it.
  it('refuses a verdict outside the contract', async () => {
    vi.stubGlobal('fetch', respondWith(200, { ...working, status: 'broken' }));

    await expect(checkTutor()).resolves.toMatchObject({ ok: false, code: 'server.unexpected' });
  });

  it('reports a dead network rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('failed to fetch');
      }),
    );

    await expect(checkTutor()).resolves.toEqual({
      ok: false,
      code: 'network.unreachable',
      status: 0,
    });
  });
});
