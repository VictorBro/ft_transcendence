/**
 * Browser half of the API client. These run in the page rather than through a
 * server action because the session cookie is set by the API's response, and
 * Caddy serves both origins as one, so the browser's own request carries and
 * receives it with nothing to relay.
 */
import {
  SessionUserSchema,
  TwoFactorSetupSchema,
  TwoFactorRequiredSchema,
  RecoveryCodesSchema,
  type SessionUser,
} from '@ft/shared';
import { z } from 'zod';

import { clientPost, clientPatch, clientDelete, type ApiResult } from '@/lib/api-client';

const EmptyResponseSchema = z.void();
const LoginResponseSchema = z.union([SessionUserSchema, TwoFactorRequiredSchema]);

/** The 202 branch of a login: password accepted, second factor still owed. */
export type LoginResult = ApiResult<SessionUser> | { ok: 'twoFactor' };

const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' };

/**
 * Nest reports Zod failures as an array of codes. Showing the first is enough
 * for a form that validates the same rules client-side before submitting.
 *
 * The body is still read as `message`, which is what Nest's exception filter
 * names the field; only its contents changed from prose to an ERROR_CODES entry.
 */
function readCode(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0];
    }
  }
  return null;
}

async function send<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      // FormData sets its own Content-Type, boundary included. Overriding it
      // makes the upload unparseable.
      headers: init.body instanceof FormData ? undefined : JSON_HEADERS,
    });
  } catch {
    return { ok: false, code: 'network.unreachable', status: 0 };
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      code: readCode(body) ?? 'server.unexpected',
      status: response.status,
    };
  }
  return { ok: true, data: body as T };
}

export async function signUp(input: unknown): Promise<ApiResult<SessionUser>> {
  return clientPost(SessionUserSchema, '/api/auth/signup', input);
}

export async function logIn(input: unknown): Promise<LoginResult> {
  const result = await clientPost(LoginResponseSchema, '/api/auth/login', input);
  if (!result.ok) {
    return result;
  }
  return 'twoFactorRequired' in result.data ? { ok: 'twoFactor' } : { ok: true, data: result.data };
}

export async function verifySecondFactor(code: string): Promise<ApiResult<SessionUser>> {
  return clientPost(SessionUserSchema, '/api/auth/2fa/verify', { code });
}

export async function logOut(): Promise<ApiResult<void>> {
  return clientPost(EmptyResponseSchema, '/api/auth/logout');
}

export async function updateProfile(input: unknown): Promise<ApiResult<SessionUser>> {
  return clientPatch(SessionUserSchema, '/api/users/me', input);
}

export async function beginTwoFactorSetup(): Promise<
  ApiResult<{ secret: string; otpauthUri: string; qrDataUrl: string }>
> {
  return clientPost(TwoFactorSetupSchema, '/api/auth/2fa/setup');
}

export async function enableTwoFactor(
  code: string,
): Promise<ApiResult<{ recoveryCodes: string[] }>> {
  return clientPost(RecoveryCodesSchema, '/api/auth/2fa/enable', { code });
}

export async function disableTwoFactor(password: string): Promise<ApiResult<void>> {
  return clientDelete(EmptyResponseSchema, '/api/auth/2fa', { password });
}

export function uploadAvatar(file: File): Promise<ApiResult<SessionUser>> {
  const formData = new FormData();
  formData.append('avatar', file);
  return send<SessionUser>('/api/users/me/avatar', { method: 'POST', body: formData });
}

/** Back to the default image. The server deletes the file it was using. */
export function removeAvatar(): Promise<ApiResult<SessionUser>> {
  return send<SessionUser>('/api/users/me/avatar', { method: 'DELETE' });
}
