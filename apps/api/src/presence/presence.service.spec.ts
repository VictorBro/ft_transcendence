import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisService } from '../redis/redis.service';
import { PRESENCE_GRACE_MS, PresenceService } from './presence.service';

/** The commands the service sends, on a Map: Redis keeps strings, and a missing key reads null. */
function fakeRedis(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const add = (key: string, by: number) => {
    const count = Number(store.get(key) ?? 0) + by;
    store.set(key, String(count));
    return Promise.resolve(count);
  };
  const client = {
    incr: vi.fn((key: string) => add(key, 1)),
    decr: vi.fn((key: string) => add(key, -1)),
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    mGet: vi.fn((keys: string[]) => Promise.resolve(keys.map((key) => store.get(key) ?? null))),
    del: vi.fn((keys: string[]) => {
      for (const key of keys) store.delete(key);
      return Promise.resolve(keys.length);
    }),
    // Batches, as SCAN returns them, an empty one included.
    scanIterator: vi.fn(({ MATCH }: { MATCH: string }) => {
      const prefix = MATCH.replace('*', '');
      return [[...store.keys()].filter((key) => key.startsWith(prefix)), []];
    }),
  };
  const service = new PresenceService({ client } as unknown as RedisService);
  return { service, store, client };
}

/** Whether the promise has settled yet, without waiting for it. */
function watch<T>(promise: Promise<T>): { settled: () => boolean; value: Promise<T> } {
  let settled = false;
  void promise.then(() => (settled = true));
  return { settled: () => settled, value: promise };
}

describe('PresenceService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('connected', () => {
    it('says the first socket brought the user online, and no later one', async () => {
      const { service } = fakeRedis();

      expect(await service.connected('bob')).toBe(true);
      expect(await service.connected('bob')).toBe(false);
    });

    it('counts each user apart', async () => {
      const { service } = fakeRedis();

      await service.connected('bob');

      expect(await service.connected('alice')).toBe(true);
    });
  });

  describe('disconnected', () => {
    it('says no one left while another tab is open', async () => {
      const { service } = fakeRedis({ 'presence:bob': '2' });

      const left = service.disconnected('bob');
      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS);

      expect(await left).toBe(false);
    });

    it('says the user left once the grace period has passed, not before', async () => {
      const { service } = fakeRedis({ 'presence:bob': '1' });

      const left = watch(service.disconnected('bob'));
      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS - 1);
      expect(left.settled()).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(await left.value).toBe(true);
    });

    // During the wait, the REST routes and the snapshot on connect must agree
    // with the friends who already see the user online.
    it('keeps the user counted, so online, until the grace period ends', async () => {
      const { service } = fakeRedis({ 'presence:bob': '1' });

      const left = service.disconnected('bob');
      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS - 1);
      expect(await service.isOnline(['bob'])).toEqual(new Set(['bob']));

      await vi.advanceTimersByTimeAsync(1);
      await left;
      expect(await service.isOnline(['bob'])).toEqual(new Set());
    });

    // A reload closes the socket and opens another: friends must not see a flicker.
    it('says nothing left, and no second online, when a tab came back within the grace period', async () => {
      const { service } = fakeRedis({ 'presence:bob': '1' });

      const left = service.disconnected('bob');
      await vi.advanceTimersByTimeAsync(500);
      expect(await service.connected('bob')).toBe(false);
      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS);

      expect(await left).toBe(false);
    });

    // An older close must not answer for a newer one.
    it('goes offline a full grace period after the last close, not the first', async () => {
      const { service } = fakeRedis({ 'presence:bob': '1' });

      const first = watch(service.disconnected('bob'));
      await vi.advanceTimersByTimeAsync(500);
      await service.connected('bob');
      await vi.advanceTimersByTimeAsync(9_000);
      const last = watch(service.disconnected('bob'));

      // 10 s after the first close, 0.5 s after the last: nothing yet.
      await vi.advanceTimersByTimeAsync(500);
      expect(await first.value).toBe(false);
      expect(last.settled()).toBe(false);

      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS - 500);
      expect(await last.value).toBe(true);
    });

    // A socket closing after a restart reset the counts would take them below zero.
    it('puts a count gone below zero back to zero, so the next socket comes online', async () => {
      const { service, store } = fakeRedis();

      const left = service.disconnected('bob');
      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS);
      expect(await left).toBe(true);
      expect(store.get('presence:bob')).toBe('0');

      expect(await service.connected('bob')).toBe(true);
    });
  });

  describe('isOnline', () => {
    it('keeps the ids holding a socket', async () => {
      const { service } = fakeRedis({ 'presence:bob': '2', 'presence:zoe': '0' });

      expect(await service.isOnline(['bob', 'alice', 'zoe'])).toEqual(new Set(['bob']));
    });

    // MGET with no key is a Redis error.
    it('asks Redis nothing for no ids', async () => {
      const { service, client } = fakeRedis();

      expect(await service.isOnline([])).toEqual(new Set());
      expect(client.mGet).not.toHaveBeenCalled();
    });
  });

  describe('onApplicationBootstrap', () => {
    it('drops every count and leaves the sessions alone', async () => {
      const { service, store, client } = fakeRedis({
        'presence:bob': '2',
        'presence:alice': '1',
        'sess:abc': '{}',
      });

      await service.onApplicationBootstrap();

      expect([...store.keys()]).toEqual(['sess:abc']);
      // The empty batch is skipped: DEL with no key is a Redis error.
      expect(client.del).toHaveBeenCalledTimes(1);
    });
  });
});
