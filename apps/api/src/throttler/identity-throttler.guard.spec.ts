import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityThrottlerGuard } from './identity-throttler.guard';

type FakeRequest = {
  session?: { userId?: string };
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string>;
};

const ANONYMOUS_LIMIT = 100;
const ROUTE_LIMIT = 5;

/**
 * A real decorated handler rather than a mocked reflector. The guard finds a
 * route's own limit by building a metadata key from the throttler name, and a
 * mock would answer whatever key it was handed - including a misspelt one.
 * Going through @Throttle and a real Reflector means the lookup has to be
 * spelt exactly as Nest spells it or these tests stop passing.
 */
class RouteFixture {
  @Throttle({ default: { limit: ROUTE_LIMIT, ttl: 60_000 } })
  guarded(): void {}

  plain(): void {}
}

function contextFor(request: FakeRequest, handler: () => void): ExecutionContext {
  const req = { headers: {}, ...request };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ header: vi.fn() }) }),
    getHandler: () => handler,
    getClass: () => RouteFixture,
  } as unknown as ExecutionContext;
}

describe('IdentityThrottlerGuard', () => {
  const storageService = { increment: vi.fn() };
  let guard: IdentityThrottlerGuard;

  beforeEach(async () => {
    storageService.increment.mockReset();
    storageService.increment.mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    guard = new IdentityThrottlerGuard(
      { throttlers: [{ ttl: 60_000, limit: ANONYMOUS_LIMIT }] },
      storageService as never,
      new Reflector(),
    );
    // Nest calls this at boot; it is what resolves the configured throttlers
    // and binds getTracker, so the guard is inert without it.
    await guard.onModuleInit();
  });

  const tracker = (request: FakeRequest): Promise<string> =>
    (guard as unknown as { getTracker: (req: FakeRequest) => Promise<string> }).getTracker(request);

  // The tracker is the whole point: every request reaches this API from a
  // container address, so counting by IP puts unrelated users in one bucket.
  describe('getTracker', () => {
    it('keys a signed-in caller on the user, not the container IP', async () => {
      await expect(tracker({ session: { userId: 'u1' }, ip: '172.18.0.5' })).resolves.toBe(
        'user:u1',
      );
    });

    // Two accounts behind the same proxy address must not share a quota; this
    // is what stops one busy user from exhausting everyone else's budget.
    it('gives two users behind one IP separate keys', async () => {
      const a = await tracker({ session: { userId: 'u1' }, ip: '172.18.0.5' });
      const b = await tracker({ session: { userId: 'u2' }, ip: '172.18.0.5' });

      expect(a).not.toBe(b);
    });

    it('falls back to the client address when there is no session', async () => {
      await expect(tracker({ ip: '203.0.113.7' })).resolves.toBe('ip:203.0.113.7');
    });

    // A half-finished login (pendingUserId, no userId) is not an account yet
    // and must be counted against the machine it is coming from.
    it('treats a session without a userId as anonymous', async () => {
      await expect(tracker({ session: {}, ip: '203.0.113.7' })).resolves.toBe('ip:203.0.113.7');
    });

    it('still produces a key when the address is unavailable', async () => {
      await expect(tracker({ socket: {} })).resolves.toBe('ip:unknown');
    });
  });

  /**
   * Driven through canActivate rather than handleRequest, because canActivate
   * is where the route's own @Throttle is resolved and where getTracker is
   * wired in. Anything less exercises the guard's bookkeeping without the two
   * pieces it has to agree with.
   *
   * The assertion reads the key the storage was asked to increment: that key
   * is the quota, so "who shares a bucket with whom" is stated directly rather
   * than inferred from a limit.
   */
  describe('canActivate', () => {
    const keyCountedFor = async (request: FakeRequest, handler: () => void): Promise<string> => {
      await guard.canActivate(contextFor(request, handler));
      return storageService.increment.mock.calls[0][0] as string;
    };

    const limitCountedFor = async (request: FakeRequest, handler: () => void): Promise<number> => {
      await guard.canActivate(contextFor(request, handler));
      return storageService.increment.mock.calls[0][2] as number;
    };

    /**
     * generateKey hashes the tracker, so the stored key is opaque. Hashing the
     * expected tracker through the guard's own generateKey states the intent
     * ("this request must be counted as X") without the test knowing or caring
     * how the hash is built.
     *
     * The handler is part of that hash: quotas are per route, so a key is only
     * comparable against another key for the same handler.
     */
    const keyFor = (tracker: string, handler: () => void): string =>
      (
        guard as unknown as {
          generateKey: (context: ExecutionContext, suffix: string, name: string) => string;
        }
      ).generateKey(contextFor({}, handler), tracker, 'default');

    it('counts an ordinary route against the account', async () => {
      await expect(
        keyCountedFor(
          { session: { userId: 'u1' }, ip: '172.18.0.5' },
          RouteFixture.prototype.plain,
        ),
      ).resolves.toBe(keyFor('user:u1', RouteFixture.prototype.plain));
    });

    it('counts an anonymous caller against the client address', async () => {
      await expect(
        keyCountedFor({ ip: '203.0.113.7' }, RouteFixture.prototype.plain),
      ).resolves.toBe(keyFor('ip:203.0.113.7', RouteFixture.prototype.plain));
    });

    // Two signed-in users must not land in the same bucket - the failure the
    // whole guard exists to prevent, asserted on the key that does the sharing.
    it('gives two signed-in users separate buckets on the same route', async () => {
      const a = await keyCountedFor(
        { session: { userId: 'u1' }, ip: '172.18.0.5' },
        RouteFixture.prototype.plain,
      );
      storageService.increment.mockClear();
      const b = await keyCountedFor(
        { session: { userId: 'u2' }, ip: '172.18.0.5' },
        RouteFixture.prototype.plain,
      );

      expect(a).not.toBe(b);
    });

    // The regression that matters. Counting login or 2fa/verify per account
    // would let an attacker open a fresh 5/min budget per account he controls,
    // so a limit that reads 5 would behave like 5N. This fails if the metadata
    // key the guard builds ever stops matching the one @Throttle writes.
    it('counts a route with its own @Throttle against the address, session or not', async () => {
      await expect(
        keyCountedFor(
          { session: { userId: 'u1' }, ip: '203.0.113.7' },
          RouteFixture.prototype.guarded,
        ),
      ).resolves.toBe(keyFor('ip:203.0.113.7', RouteFixture.prototype.guarded));
    });

    // Pins the other half of that lookup: the decorated route must still be
    // metered at its own 5, not at the global ceiling.
    it('keeps the route limit on a decorated route', async () => {
      await expect(
        limitCountedFor(
          { session: { userId: 'u1' }, ip: '203.0.113.7' },
          RouteFixture.prototype.guarded,
        ),
      ).resolves.toBe(ROUTE_LIMIT);
    });

    it('meters an undecorated route at the configured ceiling', async () => {
      await expect(
        limitCountedFor({ session: { userId: 'u1' } }, RouteFixture.prototype.plain),
      ).resolves.toBe(ANONYMOUS_LIMIT);
    });
  });
});
