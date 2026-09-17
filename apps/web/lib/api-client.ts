import type { z } from 'zod';

/**
 * Failures carry a code, never a sentence: the component that displays them
 * turns it into text in the reader's language through useErrorMessage().
 */

export const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; status: number };

/**
 * Nest reports Zod failures as an array of codes. Showing the first is enough
 * for a form that validates the same rules client-side before submitting.
 *
 * The body is still read as `message`, which is what Nest's exception filter
 * names the field; only its contents changed from prose to an ERROR_CODES entry.
 */
export function readCode(body: unknown): string | null {
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

/**
 * Sends a browser request and validates successful responses with the supplied schema.
 *
 * @param schema - Response validator; use a void schema for HTTP 204 responses.
 * @param path - Plain same-origin API path without a query string or fragment.
 * @param init - Fetch options, including the method and optional JSON body.
 * @param params - Optional query parameters to encode and append to the path.
 * @returns Validated data or an error code and HTTP status. Network failures use status 0.
 */
export async function send<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  init: RequestInit = {},
  params: Record<string, string> = {},
): Promise<ApiResult<z.infer<Schema>>> {
  let response: Response;
  try {
    const query = new URLSearchParams(params).toString();
    const requestPath = path + (query ? `?${query}` : '');
    const headers = new Headers(JSON_HEADERS);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    response = await fetch(requestPath, {
      ...init,
      credentials: 'same-origin',
      headers,
    });
  } catch {
    return { ok: false, code: 'network.unreachable', status: 0 };
  }

  let body: unknown;
  if (response.status !== 204) {
    try {
      body = await response.json();
    } catch {
      return { ok: false, code: 'server.unexpected', status: response.status };
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      code: readCode(body) ?? 'server.unexpected',
      status: response.status,
    };
  }
  try {
    const parsed = await schema.safeParseAsync(body);
    if (parsed.success) {
      return { ok: true, data: parsed.data };
    }
  } catch {
    // Async validators may throw; keep failures in the ApiResult contract.
  }
  return { ok: false, code: 'server.unexpected', status: response.status };
}

/**
 * Fetches and validates JSON from a plain same-origin API path.
 *
 * @param schema - Response validator.
 * @param path - API path without a query string or fragment.
 * @param params - Optional query parameters.
 * @returns Validated data or an API error code and status.
 */
export function clientGet<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  params: Record<string, string> = {},
): Promise<ApiResult<z.infer<Schema>>> {
  return send(schema, path, { method: 'GET' }, params);
}

/**
 * Sends a POST request with JSON data and validates the response.
 *
 * @param schema - Response validator; use a void schema for HTTP 204.
 * @param path - API path without a query string or fragment.
 * @param body - Unserialized data; omitted bodies send no request body.
 * @param params - Optional query parameters.
 * @returns Validated data or an API error code and status.
 */
export function clientPost<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  body?: unknown,
  params: Record<string, string> = {},
): Promise<ApiResult<z.infer<Schema>>> {
  return send(schema, path, { method: 'POST', body: JSON.stringify(body) }, params);
}

/**
 * Sends a PUT request with JSON data and validates the response.
 *
 * @param schema - Response validator; use a void schema for HTTP 204.
 * @param path - API path without a query string or fragment.
 * @param body - Unserialized data; omitted bodies send no request body.
 * @param params - Optional query parameters.
 * @returns Validated data or an API error code and status.
 */
export function clientPut<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  body?: unknown,
  params: Record<string, string> = {},
): Promise<ApiResult<z.infer<Schema>>> {
  return send(schema, path, { method: 'PUT', body: JSON.stringify(body) }, params);
}

/**
 * Sends a PATCH request with JSON data and validates the response.
 *
 * @param schema - Response validator; use a void schema for HTTP 204.
 * @param path - API path without a query string or fragment.
 * @param body - Unserialized data; omitted bodies send no request body.
 * @param params - Optional query parameters.
 * @returns Validated data or an API error code and status.
 */
export function clientPatch<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  body?: unknown,
  params: Record<string, string> = {},
): Promise<ApiResult<z.infer<Schema>>> {
  return send(schema, path, { method: 'PATCH', body: JSON.stringify(body) }, params);
}

/**
 * Sends a DELETE request with JSON data and validates the response.
 *
 * @param schema - Response validator; use a void schema for HTTP 204.
 * @param path - API path without a query string or fragment.
 * @param body - Unserialized data; omitted bodies send no request body.
 * @param params - Optional query parameters.
 * @returns Validated data or an API error code and status.
 */
export function clientDelete<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  body?: unknown,
  params: Record<string, string> = {},
): Promise<ApiResult<z.infer<Schema>>> {
  return send(schema, path, { method: 'DELETE', body: JSON.stringify(body) }, params);
}
