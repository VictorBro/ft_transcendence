import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

type DestroyCallback = (error?: unknown) => void;

function requestWith(destroy: (cb: DestroyCallback) => void) {
  const clearCookie = vi.fn();
  const request = { session: { destroy }, res: { clearCookie } } as unknown as Request;
  return { request, clearCookie };
}

describe('AuthController', () => {
  const auth = {} as AuthService;
  let controller: AuthController;

  beforeEach(() => {
    vi.resetAllMocks();
    controller = new AuthController(auth);
  });

  it('clears the cookie once the session is destroyed', async () => {
    const { request, clearCookie } = requestWith((cb) => cb());

    await expect(controller.logout(request)).resolves.toBeUndefined();
    expect(clearCookie).toHaveBeenCalledWith('ft.sid', { path: '/' });
  });

  // A 204 here would claim the session is gone while it is still usable.
  it('fails when the store cannot destroy the session', async () => {
    const { request, clearCookie } = requestWith((cb) => cb(new Error('redis is down')));

    await expect(controller.logout(request)).rejects.toThrow('redis is down');
    expect(clearCookie).not.toHaveBeenCalled();
  });

  // connect-redis can surface a non-Error value, which must still reject.
  it('rejects with an Error when the store reports a bare string', async () => {
    const { request } = requestWith((cb) => cb('ECONNREFUSED'));

    await expect(controller.logout(request)).rejects.toBeInstanceOf(Error);
  });
});
