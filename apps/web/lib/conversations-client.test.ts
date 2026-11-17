import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchEarlierMessages, fetchNewestMessages } from './conversations-client';

const them = '0b6f8a52-3c1e-4d7a-9f2b-5e8c1a4d7b90';
const cursor = '6f1c2b0e-9a4d-4e7b-8c3a-2d5f7e9b1a04';

const page = {
  messages: [
    {
      id: cursor,
      senderId: them,
      text: 'salut',
      createdAt: '2026-11-16T10:00:00.000Z',
    },
  ],
  nextCursor: null,
};

function respondWith(status: number, body: unknown): typeof fetch {
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

describe('fetchNewestMessages', () => {
  it('asks for the conversation with the other user, without a cursor', async () => {
    const fetchMock = respondWith(200, page);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchNewestMessages(them)).resolves.toEqual({ ok: true, data: page });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/conversations/${them}/messages`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('reports a failure as a code', async () => {
    vi.stubGlobal('fetch', respondWith(400, { message: 'request.invalid' }));

    await expect(fetchNewestMessages(them)).resolves.toEqual({
      ok: false,
      code: 'request.invalid',
      status: 400,
    });
  });
});

describe('fetchEarlierMessages', () => {
  it('asks for the page before the cursor', async () => {
    const fetchMock = respondWith(200, page);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchEarlierMessages(them, cursor)).resolves.toEqual({ ok: true, data: page });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/conversations/${them}/messages?cursor=${cursor}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
