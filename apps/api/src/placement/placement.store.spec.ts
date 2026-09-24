import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { RedisService } from '../redis/redis.service';
import { initial } from './placement.machine';
import { PlacementStore, type Run } from './placement.store';

/** Just enough of node-redis for the store: strings, NX, TTLs and the release script. */
class FakeRedis {
  readonly values = new Map<string, string>();
  readonly ttls = new Map<string, number>();

  get = vi.fn(async (key: string) => this.values.get(key) ?? null);

  set = vi.fn(async (key: string, value: string, options?: { NX?: boolean; EX?: number }) => {
    if (options?.NX && this.values.has(key)) {
      return null;
    }
    this.values.set(key, value);
    if (options?.EX !== undefined) {
      this.ttls.set(key, options.EX);
    }
    return 'OK';
  });

  del = vi.fn(async (key: string) => (this.values.delete(key) ? 1 : 0));

  /** The release script: delete only when the stored token is ours. */
  eval = vi.fn(
    async (_script: string, { keys, arguments: args }: { keys: string[]; arguments: string[] }) => {
      if (this.values.get(keys[0]) !== args[0]) {
        return 0;
      }
      this.values.delete(keys[0]);
      return 1;
    },
  );
}

const storeWith = (redis: FakeRedis) =>
  new PlacementStore({ client: redis } as unknown as RedisService);

const run: Run = {
  lang: 'de',
  search: initial(),
  current: { questionId: randomUUID(), servedAt: 1_000, options: ['a', 'b', 'c', 'd'] },
  answers: [],
};

describe('PlacementStore', () => {
  it('reads back what it saved', async () => {
    const store = storeWith(new FakeRedis());

    await store.save('user-1', run);

    await expect(store.load('user-1')).resolves.toEqual(run);
  });

  it('reads nothing when there is no run', async () => {
    await expect(storeWith(new FakeRedis()).load('user-1')).resolves.toBeNull();
  });

  it('re-arms the hour on every save, so a run in progress never expires', async () => {
    const redis = new FakeRedis();

    await storeWith(redis).save('user-1', run);

    expect(redis.ttls.get('placement:user-1')).toBe(3600);
  });

  /** A shape from older code must not become a 500 the learner cannot get past. */
  it.each(['not json', '{"lang":"de"}', '{"lang":"xx","search":{}}'])(
    'drops %s and reads it as no run',
    async (raw) => {
      const redis = new FakeRedis();
      redis.values.set('placement:user-1', raw);

      await expect(storeWith(redis).load('user-1')).resolves.toBeNull();
      expect(redis.values.has('placement:user-1')).toBe(false);
    },
  );

  it('keeps each learner in their own key', async () => {
    const store = storeWith(new FakeRedis());

    await store.save('user-1', run);

    await expect(store.load('user-2')).resolves.toBeNull();
  });

  describe('withLock', () => {
    it('runs the work and frees the lock afterwards', async () => {
      const redis = new FakeRedis();

      await expect(storeWith(redis).withLock('user-1', async () => 'done')).resolves.toBe('done');
      expect(redis.values.has('placement:user-1:lock')).toBe(false);
    });

    it('frees the lock when the work throws', async () => {
      const redis = new FakeRedis();
      const failing = storeWith(redis).withLock('user-1', () => Promise.reject(new Error('boom')));

      await expect(failing).rejects.toThrow('boom');
      expect(redis.values.has('placement:user-1:lock')).toBe(false);
    });

    it('turns a second request away while the first holds the lock', async () => {
      const redis = new FakeRedis();
      const store = storeWith(redis);

      const second = store.withLock('user-1', () => store.withLock('user-1', async () => 'never'));

      await expect(second).rejects.toThrow(new ConflictException('placement.inProgress'));
    });

    /** A lock that expired mid-request may already be the next request's. */
    it('never frees a lock that is no longer its own', async () => {
      const redis = new FakeRedis();

      await storeWith(redis).withLock('user-1', async () => {
        redis.values.set('placement:user-1:lock', 'someone-else');
      });

      expect(redis.values.get('placement:user-1:lock')).toBe('someone-else');
    });
  });
});
