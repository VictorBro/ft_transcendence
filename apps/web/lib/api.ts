/**
 * The only place apps/web talks to NestJS. Per the architecture rule, Next does
 * presentation and SSR only, so nothing here knows about domain logic: it builds
 * a URL, calls the API over the internal Docker network, and narrows the answer.
 */
import { SessionUserSchema, type SessionUser } from '@ft/shared';

export const DEFAULT_API_INTERNAL_URL = 'http://api:3001';
export const SESSION_PATH = '/api/auth/me';
export const HEALTH_PATH = '/api/health';
export const DEFAULT_TIMEOUT_MS = 2000;

export interface ApiRequestOptions {
  baseUrl?: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchSessionOptions extends ApiRequestOptions {
  cookie?: string | undefined;
  /**
   * The visitor's own address, taken from the header Caddy set on the way in.
   * This call is web talking to api, so without it the API rate-limits every
   * anonymous page render on the site against the one web container address.
   */
  forwardedFor?: string | undefined;
}

/**
 * Three answers, not two. "signed-out" is a verdict the API delivered (401);
 * "unavailable" is the absence of a verdict, and the caller must not read it as
 * one. Collapsing them is what turned a 429 or a restart into a logout.
 */
export type SessionResult =
  | { status: 'ok'; user: SessionUser }
  | { status: 'signed-out' }
  | { status: 'unavailable'; reason: string };

/** Falls back to the compose service name when API_INTERNAL_URL is unset or blank. */
export function resolveApiBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === '') {
    return DEFAULT_API_INTERNAL_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

export function buildApiUrl(baseUrl: string | undefined, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${resolveApiBaseUrl(baseUrl)}${suffix}`;
}

export function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'TimeoutError' ? 'the request timed out' : error.message;
  }
  return 'an unknown network error occurred';
}

/**
 * Reading the session during SSR. The browser's cookie never reaches the
 * internal request on its own, so the caller forwards the header; without it
 * every server-rendered page would believe nobody is signed in.
 *
 * 401 is the only status that means "not authenticated": it is the sole
 * rejection AuthGuard raises. Everything else (429, 5xx, a timeout, an API
 * that is not up yet) says nothing about the visitor and is reported as
 * unavailable, so no caller can mistake an incident for a verdict.
 */
export async function fetchSession(options: FetchSessionOptions = {}): Promise<SessionResult> {
  const {
    baseUrl,
    cookie,
    forwardedFor,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  try {
    const response = await fetchImpl(buildApiUrl(baseUrl, SESSION_PATH), {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 401) {
      return { status: 'signed-out' };
    }

    if (!response.ok) {
      return { status: 'unavailable', reason: `the API answered HTTP ${response.status}` };
    }

    const parsed = SessionUserSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { status: 'unavailable', reason: 'the API returned an unexpected payload' };
    }

    return { status: 'ok', user: parsed.data };
  } catch (error) {
    return { status: 'unavailable', reason: describeFetchError(error) };
  }
}

export type PingResult = { status: 'ok' } | { status: 'unreachable'; reason: string };

/**
 * Whether the internal web -> api hop works at all. No page can answer this:
 * they fold an unreachable API into the signed-out view on purpose, so a
 * misconfigured API_INTERNAL_URL still renders a perfectly valid page.
 *
 * Any HTTP answer counts as reachable, including a 429 or a 500. The question
 * is whether the hop exists, not whether the API is happy. Reporting the
 * container as broken because the caller was rate-limited would be a false
 * alarm, and /api/health already covers the API's own view of itself.
 */
export async function pingApi(options: ApiRequestOptions = {}): Promise<PingResult> {
  const { baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;

  try {
    await fetchImpl(buildApiUrl(baseUrl, HEALTH_PATH), {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: 'ok' };
  } catch (error) {
    return { status: 'unreachable', reason: describeFetchError(error) };
  }
}
