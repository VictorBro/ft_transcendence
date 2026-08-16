/**
 * Browser half of the API client. These run in the page rather than through a
 * server action because the session cookie is set by the API's response, and
 * Caddy serves both origins as one, so the browser's own request carries and
 * receives it with nothing to relay.
 */
import type { SessionUser } from '@ft/shared';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; status: number };

/** The 202 branch of a login: password accepted, second factor still owed. */
export type LoginResult = ApiResult<SessionUser> | { ok: 'twoFactor' };

const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' };

/**
 * Nest reports Zod failures as an array of messages. Showing the first is enough
 * for a form that validates the same rules client-side before submitting.
 */
function readMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0];
    }
  }
  return `The server answered HTTP ${status}`;
}

async function send<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { ...JSON_HEADERS, ...init.headers },
    });
  } catch {
    return { ok: false, message: 'Could not reach the server', status: 0 };
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, message: readMessage(body, response.status), status: response.status };
  }
  return { ok: true, data: body as T };
}

export async function signUp(input: unknown): Promise<ApiResult<SessionUser>> {
  return send<SessionUser>('/api/auth/signup', { method: 'POST', body: JSON.stringify(input) });
}

export async function logIn(input: unknown): Promise<LoginResult> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  }).catch(() => null);

  if (response === null) {
    return { ok: false, message: 'Could not reach the server', status: 0 };
  }
  if (response.status === 202) {
    return { ok: 'twoFactor' };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, message: readMessage(body, response.status), status: response.status };
  }
  return { ok: true, data: body as SessionUser };
}

export async function verifySecondFactor(code: string): Promise<ApiResult<SessionUser>> {
  return send<SessionUser>('/api/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function logOut(): Promise<ApiResult<void>> {
  return send<void>('/api/auth/logout', { method: 'POST' });
}

export async function updateProfile(input: unknown): Promise<ApiResult<SessionUser>> {
  return send<SessionUser>('/api/users/me', { method: 'PATCH', body: JSON.stringify(input) });
}

export async function beginTwoFactorSetup(): Promise<
  ApiResult<{ secret: string; otpauthUri: string; qrDataUrl: string }>
> {
  return send('/api/auth/2fa/setup', { method: 'POST' });
}

export async function enableTwoFactor(
  code: string,
): Promise<ApiResult<{ recoveryCodes: string[] }>> {
  return send('/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
}

export async function disableTwoFactor(password: string): Promise<ApiResult<void>> {
  return send<void>('/api/auth/2fa', { method: 'DELETE', body: JSON.stringify({ password }) });
}

export async function uploadAvatar(file: File): Promise<ApiResult<SessionUser>> {
  const formData = new FormData();
  formData.append('avatar', file);

  let response: Response;
  try {
    response = await fetch('/api/users/me/avatar', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });
  } catch {
    return { ok: false, message: 'Could not reach the server', status: 0 };
  }

  const responseBody: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      message: readMessage(responseBody, response.status),
      status: response.status,
    };
  }
  return { ok: true, data: responseBody as SessionUser };
}
