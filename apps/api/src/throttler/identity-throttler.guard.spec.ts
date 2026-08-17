import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerRequest } from '@nestjs/throttler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityThrottlerGuard, SESSION_THROTTLE_LIMIT } from './identity-throttler.guard';

type FakeRequest = {
  session?: { userId?: string };
  ip?: string;
  socket?: { remoteAddress?: string };
};

function contextFor(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function requestProps(context: ExecutionContext, limit = 100): ThrottlerRequest {
  return {
    context,
    limit,
    ttl: 60_000,
    // "default" is the name of the configured throttler and is the same on
    // every route, decorated or not - the fixture keeps it that way on purpose.
    throttler: { name: 'default', ttl: 60_000, limit },
    blockDuration: 60_000,
    getTracker: vi.fn(),
    generateKey: vi.fn(),
  } as unknown as ThrottlerRequest;
}

describe('IdentityThrottlerGuard', () => {
  const reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
  const storageService = { increment: vi.fn() };
  let guard: IdentityThrottlerGuard;

  beforeEach(() => {
    vi.resetAllMocks();
    guard = new IdentityThrottlerGuard(
      { throttlers: [{ ttl: 60_000, limit: 100 }] },
      storageService as never,
      reflector,
    );
  });

  // The tracker is the whole point: every request reaches this API from a
  // container address, so counting by IP puts unrelated users in one bucket.
  describe('getTracker', () => {
    const tracker = (request: FakeRequest): Promise<string> =>
      (guard as unknown as { getTracker: (req: FakeRequest) => Promise<string> }).getTracker(
        request,
      );

    it('keys a signed-in caller on the user, not the container IP', async () => {
      await expect(tracker({ session: { userId: 'u1' }, ip: '172.18.0.5' })).resolves.toBe(
        'user:u1',
      );
    });

    // Two accounts behind the same proxy address must not share a quota; this
    // is what stops one busy user from signing everyone else out.
    it('gives two users behind one IP separate keys', async () => {
      const a = await tracker({ session: { userId: 'u1' }, ip: '172.18.0.5' });
      const b = await tracker({ session: { userId: 'u2' }, ip: '172.18.0.5' });

      expect(a).not.toBe(b);
    });

    it('falls back to the client address when there is no session', async () => {
      await expect(tracker({ ip: '203.0.113.7' })).resolves.toBe('ip:203.0.113.7');
    });

    // A half-finished login (pendingUserId, no userId) is still anonymous and
    // must not be handed the larger authenticated quota.
    it('treats a session without a userId as anonymous', async () => {
      await expect(tracker({ session: {}, ip: '203.0.113.7' })).resolves.toBe('ip:203.0.113.7');
    });

    it('still produces a key when the address is unavailable', async () => {
      await expect(tracker({ socket: {} })).resolves.toBe('ip:unknown');
    });
  });

  describe('handleRequest', () => {
    // Reaches into the base class rather than the storage mock so the assertion
    // is about the limit this guard passes down, not about counting.
    const limitPassedTo = async (request: FakeRequest, routeLimit?: number): Promise<number> => {
      vi.mocked(reflector.getAllAndOverride).mockReturnValue(routeLimit);
      const base = vi
        .spyOn(
          Object.getPrototypeOf(IdentityThrottlerGuard.prototype) as {
            handleRequest: (props: ThrottlerRequest) => Promise<boolean>;
          },
          'handleRequest',
        )
        .mockResolvedValue(true);

      await (
        guard as unknown as { handleRequest: (props: ThrottlerRequest) => Promise<boolean> }
      ).handleRequest(requestProps(contextFor(request), routeLimit ?? 100));

      return base.mock.calls[0][0].limit;
    };

    it('raises the ceiling for a signed-in caller', async () => {
      await expect(limitPassedTo({ session: { userId: 'u1' } })).resolves.toBe(
        SESSION_THROTTLE_LIMIT,
      );
    });

    it('leaves the anonymous ceiling alone', async () => {
      await expect(limitPassedTo({ ip: '203.0.113.7' })).resolves.toBe(100);
    });

    // The regression that matters. throttler.name is "default" on decorated
    // routes too, so keying off it would lift the limit on login and 2fa/verify
    // - the endpoints a guesser hammers.
    it('never loosens a route that set its own @Throttle', async () => {
      await expect(limitPassedTo({ session: { userId: 'u1' } }, 5)).resolves.toBe(5);
    });
  });
});
