import { cookies, headers } from 'next/headers';

/**
 * The only place apps/web talks to NestJS. Per the architecture rule, Next does
 * presentation and SSR only, so nothing here knows about domain logic: it builds
 * a URL, calls the API over the internal Docker network, and narrows the answer.
 */
import { SessionUserSchema, type SessionUser } from '@ft/shared';
import type { z } from 'zod';

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

type BaseResult<T> =
  { status: 'ok'; data: T } | { status: 'signed-out' } | { status: 'unavailable'; reason: string };

/**
 * Three answers, not two. "signed-out" is a verdict the API delivered (401);
 * "unavailable" is the absence of a verdict, and the caller must not read it as
 * one. Collapsing them is what turned a 429 or a restart into a logout.
 */
export type SessionResult = BaseResult<SessionUser>;

/**
 * Three answers, not two. "signed-out" is a verdict the API delivered (401);
 * "unavailable" is the absence of a verdict, and the caller must not read it as
 * one. Collapsing them is what turned a 429 or a restart into a logout.
 */
export type GetResult = BaseResult<unknown>;

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
 * Calls an API fetcher with the current Next.js request's cookies and visitor IP.
 *
 * @remarks Requires a server request context. Caddy's X-Forwarded-For value is
 * forwarded unchanged so the API can rate-limit the visitor. Request-context
 * errors and errors thrown by the callback propagate to the caller.
 *
 * @typeParam T - The fetcher's validated response data type.
 * @param fetcher - Async callback receiving the internal base URL and forwarded headers.
 * @returns The callback's result, preserving its response data type.
 */
export async function fetchWithRequestHeaderAndIP<T>(
  fetcher: (options: FetchSessionOptions) => Promise<BaseResult<T>>,
): Promise<BaseResult<T>> {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  // Passed through unchanged rather than appended to. The API sets `trust proxy`
  // to 1, so it resolves req.ip to the RIGHT-most X-Forwarded-For entry;
  // appending this container's address would make that entry the web container
  // and put every anonymous visitor back in one bucket. Caddy is the sole
  // ingress and rewrites the header, so what arrives here is the real address.
  const forwardedFor = (await headers()).get('x-forwarded-for');

  return fetcher({
    baseUrl: process.env.API_INTERNAL_URL,
    cookie,
    forwardedFor: forwardedFor ?? undefined,
  });
}

/**
 * Performs an uncached GET request and validates its JSON body with a Zod schema.
 *
 * @typeParam Schema - Schema defining the validated response output.
 * @param schema - Response validator, including async refinements.
 * @param api_path - API path relative to the configured internal base URL.
 * @param options - Base URL, forwarded headers, timeout, and optional fetch implementation.
 * @param url_params - Query parameters; an empty record adds no question mark.
 * Supplied values replace matching parameters already present in the path.
 * @returns Validated data on success, signed-out for HTTP 401, or unavailable
 * for other HTTP failures, invalid JSON or payloads, timeouts, and network errors.
 */
async function fetch_json<Schema extends z.ZodType>(
  schema: Schema,
  api_path: string,
  options: FetchSessionOptions = {},
  url_params: Record<string, string> = {},
): Promise<BaseResult<z.infer<Schema>>> {
  const {
    baseUrl,
    cookie,
    forwardedFor,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  try {
    const url = new URL(buildApiUrl(baseUrl, api_path));
    new URLSearchParams(url_params).forEach((value, key) => url.searchParams.set(key, value));
    const response = await fetchImpl(url.toString(), {
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

    const parsed = await schema.safeParseAsync(await response.json());
    if (!parsed.success) {
      return { status: 'unavailable', reason: 'the API returned an unexpected payload' };
    }

    return { status: 'ok', data: parsed.data };
  } catch (error) {
    return { status: 'unavailable', reason: describeFetchError(error) };
  }
}

/**
 * Fetches and validates the signed-in user's record from the session endpoint.
 * The caller supplies browser cookies and visitor IP through the options;
 * this function does not read the Next.js request itself.
 *
 * 401 is the only status that means "not authenticated": it is the sole
 * rejection AuthGuard raises. Everything else (429, 5xx, a timeout, an API
 * that is not up yet) says nothing about the visitor and is reported as
 * unavailable, so no caller can mistake an incident for a verdict.
 *
 * @param options - Request configuration, including forwarded cookies and visitor IP.
 * @returns The validated session user, signed-out, or unavailable.
 */
export async function fetchSession(options: FetchSessionOptions = {}): Promise<SessionResult> {
  return fetch_json(SessionUserSchema, SESSION_PATH, options);
}

/**
 * Fetches validated JSON using the current request's cookies and visitor IP.
 *
 * @remarks Requires a Next.js server request context. Request-context errors
 * propagate; HTTP, JSON, validation, and network failures are returned as results.
 *
 * @typeParam Schema - Schema defining the validated response output.
 * @param schema - Validator for a successful response body.
 * @param api_path - API path relative to the internal base URL.
 * @param url_params - Query parameters; defaults to an empty record.
 * @returns Validated data, signed-out for HTTP 401, or unavailable on request failure.
 */
export async function apiGet<Schema extends z.ZodType>(
  schema: Schema,
  api_path: string,
  url_params: Record<string, string> = {},
): Promise<BaseResult<z.infer<Schema>>> {
  return fetchWithRequestHeaderAndIP((options) =>
    fetch_json(schema, api_path, options, url_params),
  );
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
