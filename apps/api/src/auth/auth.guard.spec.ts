import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { countActiveUsers } from '../metrics/metrics';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

type FakeRequest = {
  session?: { userId?: string; destroy: (cb: () => void) => void };
  user?: unknown;
};

function contextFor(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const auth = { findById: vi.fn() } as unknown as AuthService;
  const reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
  let guard: AuthGuard;

  beforeEach(() => {
    vi.resetAllMocks();
    // Infinitely late: every user seen so far is past the window.
    countActiveUsers(Infinity);
    guard = new AuthGuard(reflector, auth);
  });

  it('lets a @Public route through without touching the session', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(true);

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(auth.findById).not.toHaveBeenCalled();
    expect(countActiveUsers()).toBe(0);
  });

  // The whole point of registering it globally: forget the decorator and the
  // route is closed, not open.
  it('rejects a route with no session by default', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(false);

    await expect(
      guard.canActivate(contextFor({ session: { destroy: (cb) => cb() } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the user when the session resolves, and counts them as active', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(false);
    vi.mocked(auth.findById).mockResolvedValue({ id: 'u1' } as never);
    const request: FakeRequest = { session: { userId: 'u1', destroy: (cb) => cb() } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1' });
    expect(countActiveUsers()).toBe(1);
  });

  // A session outliving its user is what makes "delete the account" incomplete.
  it('destroys a session whose user is gone', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(false);
    vi.mocked(auth.findById).mockResolvedValue(null);
    const destroy = vi.fn((cb: () => void) => cb());

    await expect(
      guard.canActivate(contextFor({ session: { userId: 'deleted', destroy } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(destroy).toHaveBeenCalled();
    expect(countActiveUsers()).toBe(0);
  });
});
