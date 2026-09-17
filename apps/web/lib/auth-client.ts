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
  return clientPost(SessionUserSchema, '/api/users/me/avatar', formData);
}

/** Back to the default image. The server deletes the file it was using. */
export function removeAvatar(): Promise<ApiResult<SessionUser>> {
  return clientDelete(SessionUserSchema, '/api/users/me/avatar');
}
