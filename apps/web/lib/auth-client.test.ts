import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginTwoFactorSetup,
  disableTwoFactor,
  enableTwoFactor,
  logIn,
  logOut,
  signUp,
  updateProfile,
  verifySecondFactor,
} from './auth-client';

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

describe('signUp', () => {
  it('returns the created user', async () => {
    vi.stubGlobal('fetch', respondWith(201, { id: 'u1', email: 'a@b.co' }));

    await expect(signUp({ email: 'a@b.co' })).resolves.toEqual({
      ok: true,
      data: { id: 'u1', email: 'a@b.co' },
    });
  });

  // Nest reports Zod failures as an array; showing "[object Object]" would be useless.
  it('surfaces the first code of a validation array', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith(400, { message: ['password.needsDigit', 'password.tooShort'] }),
    );

    await expect(signUp({})).resolves.toMatchObject({
      ok: false,
      code: 'password.needsDigit',
    });
  });

  // A 502 from the proxy carries an HTML page, not a code. The status is kept so
  // the generic message can name it.
  it('falls back to a generic code when the body carries none', async () => {
    vi.stubGlobal('fetch', respondWith(500, {}));

    await expect(signUp({})).resolves.toMatchObject({
      code: 'server.unexpected',
      status: 500,
    });
  });

  it('reports a dead network rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('failed to fetch');
      }),
    );

    await expect(signUp({})).resolves.toEqual({
      ok: false,
      code: 'network.unreachable',
      status: 0,
    });
  });
});

describe('logIn', () => {
  it('returns the user when one factor is enough', async () => {
    vi.stubGlobal('fetch', respondWith(200, { id: 'u1' }));

    await expect(logIn({})).resolves.toEqual({ ok: true, data: { id: 'u1' } });
  });

  // The 202 branch is the whole reason this call is not routed through send().
  it('reports a second factor on 202 without inventing a user', async () => {
    vi.stubGlobal('fetch', respondWith(202, { twoFactorRequired: true }));

    await expect(logIn({})).resolves.toEqual({ ok: 'twoFactor' });
  });

  it('passes a wrong password through as an error', async () => {
    vi.stubGlobal('fetch', respondWith(401, { message: 'auth.invalidCredentials' }));

    await expect(logIn({})).resolves.toMatchObject({
      ok: false,
      code: 'auth.invalidCredentials',
      status: 401,
    });
  });

  it('reports a dead network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );

    await expect(logIn({})).resolves.toMatchObject({ ok: false, status: 0 });
  });
});

describe('the calls that answer 204', () => {
  it('treats an empty logout response as success', async () => {
    vi.stubGlobal('fetch', respondWith(204));

    await expect(logOut()).resolves.toEqual({ ok: true, data: undefined });
  });

  it('sends the password as JSON when disabling', async () => {
    const fetchMock = respondWith(204);
    vi.stubGlobal('fetch', fetchMock);

    await expect(disableTwoFactor('hunter2')).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/2fa',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ password: 'hunter2' }) }),
    );
  });
});

describe('the remaining endpoints', () => {
  it('verifies a second factor', async () => {
    const fetchMock = respondWith(200, { id: 'u1' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifySecondFactor('123456')).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/2fa/verify',
      expect.objectContaining({ body: JSON.stringify({ code: '123456' }) }),
    );
  });

  it('begins and confirms enrolment', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith(200, { secret: 'S', otpauthUri: 'otpauth://', qrDataUrl: 'data:' }),
    );
    await expect(beginTwoFactorSetup()).resolves.toMatchObject({ ok: true });

    vi.stubGlobal('fetch', respondWith(200, { recoveryCodes: ['a', 'b'] }));
    await expect(enableTwoFactor('123456')).resolves.toEqual({
      ok: true,
      data: { recoveryCodes: ['a', 'b'] },
    });
  });

  it('patches the profile', async () => {
    const fetchMock = respondWith(200, { id: 'u1', displayName: 'renamed' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateProfile({ displayName: 'renamed' })).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  // Same-origin, so Caddy hands the cookie to the API without any CORS dance.
  it('sends credentials on every call', async () => {
    const fetchMock = respondWith(204);
    vi.stubGlobal('fetch', fetchMock);

    await logOut();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });
});
