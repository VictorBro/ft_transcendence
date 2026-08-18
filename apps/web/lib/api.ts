/**
 * The only place apps/web talks to NestJS. Per the architecture rule, Next does
 * presentation and SSR only, so nothing here knows about domain logic: it builds
 * a URL, calls the API over the internal Docker network, and narrows the answer.
 */
import { SessionUserSchema, type SessionUser } from '@ft/shared';

export const DEFAULT_API_INTERNAL_URL = 'http://api:3001';
export const HELLO_PATH = '/api/hello';
export const SESSION_PATH = '/api/auth/me';
export const DEFAULT_TIMEOUT_MS = 2000;

export interface HelloPayload {
  message: string;
  service?: string;
}

export type HelloResult =
  { status: 'ok'; payload: HelloPayload } | { status: 'unavailable'; reason: string };

export interface FetchHelloOptions {
  baseUrl?: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchSessionOptions extends FetchHelloOptions {
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

/**
 * The API contract lives in @ft/shared and is not wired up yet, so this stays
 * defensive: anything without a non-empty string `message` is treated as a miss.
 */
export function parseHelloPayload(value: unknown): HelloPayload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const { message, service } = record;
  if (typeof message !== 'string' || message.trim() === '') {
    return null;
  }
  return typeof service === 'string' ? { message, service } : { message };
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
 * rejection AuthGuard raises. Everything else — 429, 5xx, a timeout, an API
 * that is not up yet — says nothing about the visitor and is reported as
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

/**
 * Never throws. A dead API must degrade to a rendered fallback, because the home
 * page is server-rendered and an exception here would be a 500 at defence time.
 */
export async function fetchHello(options: FetchHelloOptions = {}): Promise<HelloResult> {
  const { baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;
  const url = buildApiUrl(baseUrl, HELLO_PATH);

  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return { status: 'unavailable', reason: `the API answered HTTP ${response.status}` };
    }

    const payload = parseHelloPayload(await response.json());
    if (payload === null) {
      return { status: 'unavailable', reason: 'the API returned an unexpected payload' };
    }

    return { status: 'ok', payload };
  } catch (error) {
    return { status: 'unavailable', reason: describeFetchError(error) };
  }
}
