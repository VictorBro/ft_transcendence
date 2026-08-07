import { describe, expect, it, vi } from 'vitest';

import {
  buildApiUrl,
  DEFAULT_API_INTERNAL_URL,
  describeFetchError,
  fetchHello,
  HELLO_PATH,
  parseHelloPayload,
  resolveApiBaseUrl,
} from './api';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('resolveApiBaseUrl', () => {
  it('falls back to the compose service name when unset', () => {
    expect(resolveApiBaseUrl(undefined)).toBe(DEFAULT_API_INTERNAL_URL);
  });

  it('falls back when the value is blank', () => {
    expect(resolveApiBaseUrl('   ')).toBe(DEFAULT_API_INTERNAL_URL);
  });

  it('trims surrounding whitespace and trailing slashes', () => {
    expect(resolveApiBaseUrl('  http://api:3001//  ')).toBe('http://api:3001');
  });

  it('keeps a non-default host untouched', () => {
    expect(resolveApiBaseUrl('http://localhost:3001')).toBe('http://localhost:3001');
  });
});

describe('buildApiUrl', () => {
  it('joins base and path', () => {
    expect(buildApiUrl('http://api:3001', HELLO_PATH)).toBe('http://api:3001/api/hello');
  });

  it('adds the missing leading slash', () => {
    expect(buildApiUrl('http://api:3001', 'api/hello')).toBe('http://api:3001/api/hello');
  });

  it('never produces a double slash', () => {
    expect(buildApiUrl('http://api:3001/', '/api/hello')).toBe('http://api:3001/api/hello');
  });
});

describe('parseHelloPayload', () => {
  it('accepts a message only', () => {
    expect(parseHelloPayload({ message: 'hello' })).toEqual({ message: 'hello' });
  });

  it('keeps the service name when present', () => {
    expect(parseHelloPayload({ message: 'hello', service: 'api' })).toEqual({
      message: 'hello',
      service: 'api',
    });
  });

  it('drops a non-string service', () => {
    expect(parseHelloPayload({ message: 'hello', service: 42 })).toEqual({ message: 'hello' });
  });

  it('rejects anything without a usable message', () => {
    const rejected: unknown[] = [
      null,
      undefined,
      'hello',
      7,
      [],
      {},
      { message: '' },
      { message: '   ' },
      { message: 1 },
    ];

    for (const value of rejected) {
      expect(parseHelloPayload(value)).toBeNull();
    }
  });
});

describe('describeFetchError', () => {
  it('names a timeout', () => {
    const error = new Error('aborted');
    error.name = 'TimeoutError';
    expect(describeFetchError(error)).toBe('the request timed out');
  });

  it('passes through an error message', () => {
    expect(describeFetchError(new Error('ECONNREFUSED'))).toBe('ECONNREFUSED');
  });

  it('handles a thrown non-error', () => {
    expect(describeFetchError('boom')).toBe('an unknown network error occurred');
  });
});

describe('fetchHello', () => {
  it('returns the parsed payload on success', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return jsonResponse({ message: 'hello', service: 'api' });
    });

    const result = await fetchHello({ baseUrl: 'http://api:3001', fetchImpl });

    expect(result).toEqual({ status: 'ok', payload: { message: 'hello', service: 'api' } });
    expect(fetchImpl).toHaveBeenCalledWith('http://api:3001/api/hello', expect.anything());
  });

  it('uses the default base url when none is given', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return jsonResponse({ message: 'hello' });
    });

    await fetchHello({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${DEFAULT_API_INTERNAL_URL}${HELLO_PATH}`,
      expect.anything(),
    );
  });

  it('degrades on a non-2xx answer', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return jsonResponse({ message: 'nope' }, { status: 503 });
    });

    await expect(fetchHello({ fetchImpl })).resolves.toEqual({
      status: 'unavailable',
      reason: 'the API answered HTTP 503',
    });
  });

  it('degrades on an unexpected payload', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return jsonResponse({ greeting: 'hello' });
    });

    await expect(fetchHello({ fetchImpl })).resolves.toEqual({
      status: 'unavailable',
      reason: 'the API returned an unexpected payload',
    });
  });

  it('degrades instead of throwing when the API is down', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('connect ECONNREFUSED 172.18.0.3:3001');
    });

    await expect(fetchHello({ fetchImpl, timeoutMs: 50 })).resolves.toEqual({
      status: 'unavailable',
      reason: 'connect ECONNREFUSED 172.18.0.3:3001',
    });
  });

  it('degrades when the body is not JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response('<html>502</html>', { headers: { 'content-type': 'text/html' } });
    });

    const result = await fetchHello({ fetchImpl });

    expect(result.status).toBe('unavailable');
  });
});
