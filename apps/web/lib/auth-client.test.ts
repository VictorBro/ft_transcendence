import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginTwoFactorSetup,
  disableTwoFactor,
  enableTwoFactor,
  logIn,
  logOut,
  removeAvatar,
  signUp,
  updateProfile,
  uploadAvatar,
  verifySecondFactor,
} from './auth-client';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@b.co',
  displayName: 'learner',
  avatarUrl: null,
  locale: 'en',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
};

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
    vi.stubGlobal('fetch', respondWith(201, user));

    await expect(signUp({ email: 'a@b.co' })).resolves.toEqual({
      ok: true,
      data: user,
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
    vi.stubGlobal('fetch', respondWith(200, user));

    await expect(logIn({})).resolves.toEqual({ ok: true, data: user });
  });

  it('reports a second factor on 202 without inventing a user', async () => {
    vi.stubGlobal('fetch', respondWith(202, { twoFactorRequired: true }));

    await expect(logIn({})).resolves.toEqual({ ok: 'twoFactor' });
  });

  it('posts credentials as JSON through the browser helper', async () => {
    const fetchMock = respondWith(200, user);
    vi.stubGlobal('fetch', fetchMock);
    const input = { email: 'a@b.co', password: 'secret' };
    await logIn(input);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        credentials: 'same-origin',
      }),
    );
  });

  it.each([200, 202])('rejects an invalid login body for HTTP %i', async (status) => {
    vi.stubGlobal('fetch', respondWith(status, { twoFactorRequired: false }));
    await expect(logIn({})).resolves.toEqual({
      ok: false,
      code: 'server.unexpected',
      status,
    });
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
    const fetchMock = respondWith(200, user);
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
    const fetchMock = respondWith(200, { ...user, displayName: 'renamed' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateProfile({ displayName: 'renamed' })).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('uploads an avatar as FormData', async () => {
    const updatedUser = { ...user, avatarUrl: '/avatars/1.png' };
    const fetchMock = respondWith(200, updatedUser);
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['dummy content'], 'avatar.png', { type: 'image/png' });
    await expect(uploadAvatar(file)).resolves.toEqual({ ok: true, data: updatedUser });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me/avatar',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
        credentials: 'same-origin',
      }),
    );
  });

  it('removes an avatar', async () => {
    const fetchMock = respondWith(200, user);
    vi.stubGlobal('fetch', fetchMock);

    await expect(removeAvatar()).resolves.toEqual({ ok: true, data: user });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me/avatar',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'same-origin',
      }),
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
