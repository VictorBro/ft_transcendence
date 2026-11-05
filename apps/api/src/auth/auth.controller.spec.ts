import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@ft/shared';
import type { Request, Response } from 'express';

import type { SocketsService } from '../gateway/sockets.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';

type DestroyCallback = (error?: unknown) => void;

function requestWith(destroy: (cb: DestroyCallback) => void) {
  const clearCookie = vi.fn();
  const destroyMock = vi.fn(destroy);
  const request = {
    sessionID: 'sid-old',
    session: { destroy: destroyMock },
    res: { clearCookie },
  } as unknown as Request;
  return { request, clearCookie, destroy: destroyMock };
}

/** express-session's regenerate, as far as the controller sees it: a new id, then a save. */
function sessionRequest(regenerateError?: Error) {
  const request = { sessionID: 'sid-old' } as Request & { sessionID: string };
  request.session = {
    regenerate: (cb: (error?: unknown) => void) => {
      if (regenerateError) return cb(regenerateError);
      request.sessionID = 'sid-new';
      cb();
    },
    save: (cb: (error?: unknown) => void) => cb(),
  } as unknown as Request['session'];
  return request;
}

const USER = { id: 'user-1', email: 'learner@example.com' } as SessionUser;

describe('AuthController', () => {
  const auth = {
    signUp: vi.fn(),
    validateCredentials: vi.fn(),
    findById: vi.fn(),
    verifyPassword: vi.fn(),
  };
  const twoFactor = { verifySecondFactor: vi.fn(), confirmEnrolment: vi.fn(), disable: vi.fn() };
  const sockets = { closeSession: vi.fn() };
  let controller: AuthController;

  beforeEach(() => {
    vi.resetAllMocks();
    controller = new AuthController(
      auth as unknown as AuthService,
      twoFactor as unknown as TwoFactorService,
      sockets as unknown as SocketsService,
    );
  });

  describe('logout', () => {
    it('clears the cookie once the session is destroyed', async () => {
      const { request, clearCookie } = requestWith((cb) => cb());

      await expect(controller.logout(request)).resolves.toBeUndefined();
      expect(clearCookie).toHaveBeenCalledWith('ft.sid', { path: '/' });
    });

    // After the DEL, so a socket dialling again finds the session gone.
    it("closes that session's sockets once it is destroyed", async () => {
      const { request, destroy } = requestWith((cb) => cb());

      await controller.logout(request);

      expect(sockets.closeSession).toHaveBeenCalledWith('sid-old');
      expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(
        sockets.closeSession.mock.invocationCallOrder[0],
      );
    });

    // A 204 here would claim the session is gone while it is still usable.
    it('fails when the store cannot destroy the session', async () => {
      const { request, clearCookie } = requestWith((cb) => cb(new Error('redis is down')));

      await expect(controller.logout(request)).rejects.toThrow('redis is down');
      expect(clearCookie).not.toHaveBeenCalled();
      expect(sockets.closeSession).not.toHaveBeenCalled();
    });

    // connect-redis can surface a non-Error value, which must still reject.
    it('rejects with an Error when the store reports a bare string', async () => {
      const { request } = requestWith((cb) => cb('ECONNREFUSED'));

      await expect(controller.logout(request)).rejects.toBeInstanceOf(Error);
    });
  });

  // A tab signed in as A that signs in as B must not keep a socket in A's room.
  describe('every new session id closes the replaced one', () => {
    it('on signup', async () => {
      auth.signUp.mockResolvedValue(USER);
      const request = sessionRequest();

      await controller.signUp({} as never, request);

      expect(sockets.closeSession).toHaveBeenCalledWith('sid-old');
      expect(request.session.userId).toBe('user-1');
    });

    it('on login', async () => {
      auth.validateCredentials.mockResolvedValue({ user: USER, twoFactorEnabled: false });

      await controller.login({} as never, sessionRequest(), {} as Response);

      expect(sockets.closeSession).toHaveBeenCalledWith('sid-old');
    });

    it('on a login that still owes a second factor', async () => {
      auth.validateCredentials.mockResolvedValue({ user: USER, twoFactorEnabled: true });
      const response = { status: vi.fn() } as unknown as Response;

      await controller.login({} as never, sessionRequest(), response);

      expect(sockets.closeSession).toHaveBeenCalledWith('sid-old');
    });

    it('on the second factor', async () => {
      twoFactor.verifySecondFactor.mockResolvedValue(true);
      auth.findById.mockResolvedValue(USER);
      const request = sessionRequest();
      request.session.pendingUserId = 'user-1';

      await controller.verifySecondFactor({ code: '123456' }, request);

      expect(sockets.closeSession).toHaveBeenCalledWith('sid-old');
    });

    it('when 2FA is turned on', async () => {
      twoFactor.confirmEnrolment.mockResolvedValue(['code-1']);

      await expect(
        controller.enableTwoFactor({ code: '123456' }, USER, sessionRequest()),
      ).resolves.toEqual({ recoveryCodes: ['code-1'] });
      expect(sockets.closeSession).toHaveBeenCalledWith('sid-old');
    });

    it('when 2FA is turned off', async () => {
      auth.verifyPassword.mockResolvedValue(true);

      await controller.disableTwoFactor({ password: 'Correct-Horse-9' }, USER, sessionRequest());

      expect(twoFactor.disable).toHaveBeenCalledWith('user-1');
      expect(sockets.closeSession).toHaveBeenCalledWith('sid-old');
    });
  });

  // 2FA is already on by then: a store hiccup must not hide the only copy of the codes.
  it('returns the recovery codes even when the session cannot be rotated', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    twoFactor.confirmEnrolment.mockResolvedValue(['code-1']);

    await expect(
      controller.enableTwoFactor(
        { code: '123456' },
        USER,
        sessionRequest(new Error('redis is down')),
      ),
    ).resolves.toEqual({ recoveryCodes: ['code-1'] });
    expect(sockets.closeSession).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('session not rotated: Error: redis is down');
    warn.mockRestore();
  });
});
