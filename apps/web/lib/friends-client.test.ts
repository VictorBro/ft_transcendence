import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acceptFriendRequest,
  deleteFriendRequest,
  removeFriend,
  sendFriendRequest,
} from './friends-client';

const them = '0b6f8a52-3c1e-4d7a-9f2b-5e8c1a4d7b90';

function respondWith(status: number, body: unknown = null): typeof fetch {
  return vi.fn(async () =>
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendFriendRequest', () => {
  it('posts to the other user, and says whether it became a friendship', async () => {
    const fetchMock = respondWith(201, { status: 'accepted' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendFriendRequest(them)).resolves.toEqual({
      ok: true,
      data: { status: 'accepted' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/friends/requests/${them}`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reports a request already sent as a code', async () => {
    vi.stubGlobal('fetch', respondWith(409, { message: 'friend.alreadyRequested' }));

    await expect(sendFriendRequest(them)).resolves.toEqual({
      ok: false,
      code: 'friend.alreadyRequested',
      status: 409,
    });
  });
});

describe('acceptFriendRequest', () => {
  it('posts to the request, and reads the 204 as success', async () => {
    const fetchMock = respondWith(204);
    vi.stubGlobal('fetch', fetchMock);

    await expect(acceptFriendRequest(them)).resolves.toEqual({ ok: true, data: undefined });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/friends/requests/${them}/accept`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // The other side cancelled first: the page refreshes and shows it.
  it('reports a request that is gone as a code', async () => {
    vi.stubGlobal('fetch', respondWith(404, { message: 'friend.requestNotFound' }));

    await expect(acceptFriendRequest(them)).resolves.toEqual({
      ok: false,
      code: 'friend.requestNotFound',
      status: 404,
    });
  });
});

describe('deleteFriendRequest', () => {
  it('deletes the request between the two', async () => {
    const fetchMock = respondWith(204);
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteFriendRequest(them)).resolves.toEqual({ ok: true, data: undefined });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/friends/requests/${them}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('reports a request that is gone as a code', async () => {
    vi.stubGlobal('fetch', respondWith(404, { message: 'friend.requestNotFound' }));

    await expect(deleteFriendRequest(them)).resolves.toEqual({
      ok: false,
      code: 'friend.requestNotFound',
      status: 404,
    });
  });
});

describe('removeFriend', () => {
  it('deletes the friendship, not a request', async () => {
    const fetchMock = respondWith(204);
    vi.stubGlobal('fetch', fetchMock);

    await expect(removeFriend(them)).resolves.toEqual({ ok: true, data: undefined });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/friends/${them}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('reports someone who is not a friend as a code', async () => {
    vi.stubGlobal('fetch', respondWith(404, { message: 'friend.notFound' }));

    await expect(removeFriend(them)).resolves.toEqual({
      ok: false,
      code: 'friend.notFound',
      status: 404,
    });
  });
});
