import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DAY_QUOTA_BODY, MINUTE_QUOTA_BODY } from '../../test/gemini.fixtures';
import { seriesValue } from '../../test/metrics.fixtures';
import { llmRequestDuration, llmRequests, llmTokens, registry } from '../metrics/metrics';
import { GeminiProvider } from './gemini.provider';

const GENERATE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent';

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

/** A short answer: what a model that does not think writes. */
const ANSWERED = {
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'OK' }] } }],
  usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 1, totalTokenCount: 7 },
};

/** A reply cut at MAX_TOKENS before any text: no "OK", but Google answered. */
const THOUGHT_ONLY = {
  candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }],
  usageMetadata: { promptTokenCount: 6, thoughtsTokenCount: 16, totalTokenCount: 22 },
};

/** What Google answered a made-up key on 2026-11-27 (HTTP 400). */
const INVALID_KEY_BODY = {
  error: {
    code: 400,
    message: 'API key not valid. Please pass a valid API key.',
    status: 'INVALID_ARGUMENT',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: 'API_KEY_INVALID',
        domain: 'googleapis.com',
        metadata: { service: 'generativelanguage.googleapis.com' },
      },
    ],
  },
};

/** A 400 that is not about the key: the region, not the setting, is at fault. */
const REGION_BODY = {
  error: {
    code: 400,
    message: 'User location is not supported for the API use.',
    status: 'FAILED_PRECONDITION',
  },
};

/** The time the specs freeze Date.now() at, for retryAt. */
const NOW = Date.parse('2026-11-27T10:00:00.000Z');

/** The key check: one tiny generation, which sees the key, the model and the quota as a learner does. */
describe('GeminiProvider.check', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const provider = new GeminiProvider({ apiKey: 'test-key', model: 'gemini-test' });
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    registry.resetMetrics();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it('posts a one-word request to generateContent, the key in a header and never in the URL', async () => {
    fetchMock.mockResolvedValueOnce(json(ANSWERED));

    await provider.check();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(GENERATE_URL);
    expect(String(url)).not.toContain('test-key');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': 'test-key' },
      signal: expect.any(AbortSignal),
    });
    // The smallest real generation: one short prompt, a few tokens, and the tutor's
    // thinking setting, so a model the tutor cannot use fails the check too.
    expect(JSON.parse(init?.body as string)).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK.' }] }],
      generationConfig: { maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } },
    });
    expect(String(init?.body)).not.toContain('test-key');
  });

  // Not the 90 s of a tutor's answer: a person waits on the button.
  it('gives up after 30 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValueOnce(json(ANSWERED));

    await provider.check();

    expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(timeout.mock.results[0].value);
  });

  it.each([
    ['ok', 'a 200 with the answer', () => json(ANSWERED), 200],
    ['ok', 'a 200 cut at MAX_TOKENS before any text', () => json(THOUGHT_ONLY), 200],
    // A 200 that is not Gemini's reply is usually a proxy's page, not Google.
    ['unexpected', 'a 200 that is not JSON', () => new Response('OK'), 200],
    ['unexpected', 'a 200 with JSON that is not a reply', () => json({ status: 'up' }), 200],
    ['unexpected', 'a 200 with JSON null', () => new Response('null'), 200],
    ['invalid_key', 'the 400 API_KEY_INVALID', () => json(INVALID_KEY_BODY, 400), 400],
    ['unexpected', 'a 400 about the region', () => json(REGION_BODY, 400), 400],
    ['invalid_key', 'a 401', () => new Response('unauthenticated', { status: 401 }), 401],
    ['invalid_key', 'a 403', () => new Response('permission denied', { status: 403 }), 403],
    ['model_not_found', 'a 404', () => new Response('not found', { status: 404 }), 404],
    ['quota', 'a 429 that is not JSON', () => new Response('quota exceeded', { status: 429 }), 429],
    ['unreachable', 'a 408', () => new Response('timeout', { status: 408 }), 408],
    ['unreachable', 'a 500', () => new Response('oops', { status: 500 }), 500],
    ['unreachable', 'a 503', () => new Response('overloaded', { status: 503 }), 503],
    ['unexpected', 'a 402', () => new Response('billing', { status: 402 }), 402],
    ['unexpected', 'a 204', () => new Response(null, { status: 204 }), 204],
  ])('answers %s to %s', async (status, _, response, httpStatus) => {
    fetchMock.mockResolvedValueOnce(response());

    const found = await provider.check();

    expect(found).toEqual({ status, httpStatus, latencyMs: expect.any(Number), retryAt: null });
    expect(found.latencyMs).toBeGreaterThanOrEqual(0);
  });

  describe('a 429', () => {
    beforeEach(() => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    // The body a free key got on 2026-11-27: Google's wait runs to its midnight, Pacific time.
    it('answers quota_day for the quota of the day, and when Google said it comes back', async () => {
      fetchMock.mockResolvedValueOnce(json(DAY_QUOTA_BODY, 429));

      await expect(provider.check()).resolves.toStrictEqual({
        status: 'quota_day',
        httpStatus: 429,
        latencyMs: 0,
        retryAt: new Date(NOW + 48_933_000).toISOString(),
      });
    });

    it('answers quota for the quota of the minute, with its wait', async () => {
      fetchMock.mockResolvedValueOnce(json(MINUTE_QUOTA_BODY, 429));

      await expect(provider.check()).resolves.toStrictEqual({
        status: 'quota',
        httpStatus: 429,
        latencyMs: 0,
        retryAt: new Date(NOW + 21_000).toISOString(),
      });
    });

    // A wait past two days is a broken body: no time, and still a verdict, not unreachable.
    it('gives no time when Google gave a wait longer than any quota', async () => {
      const { details } = DAY_QUOTA_BODY.error;
      const tooLong = {
        error: {
          ...DAY_QUOTA_BODY.error,
          details: details.map((d) =>
            'retryDelay' in d ? { ...d, retryDelay: '99999999999999s' } : d,
          ),
        },
      };
      fetchMock.mockResolvedValueOnce(json(tooLong, 429));

      await expect(provider.check()).resolves.toMatchObject({
        status: 'quota_day',
        httpStatus: 429,
        retryAt: null,
      });
    });

    it('gives no time when Google gave no wait', async () => {
      const { details } = DAY_QUOTA_BODY.error;
      const noWait = {
        error: { ...DAY_QUOTA_BODY.error, details: details.filter((d) => !('retryDelay' in d)) },
      };
      fetchMock.mockResolvedValueOnce(json(noWait, 429));

      await expect(provider.check()).resolves.toMatchObject({
        status: 'quota_day',
        retryAt: null,
      });
    });
  });

  it.each([
    ['no answer', () => fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))],
    [
      'the timeout',
      () =>
        fetchMock.mockRejectedValueOnce(
          new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
        ),
    ],
    [
      'a body cut while read',
      () => {
        const cut = new ReadableStream({
          start: (body) => body.error(new TypeError('terminated')),
        });
        fetchMock.mockResolvedValueOnce(new Response(cut));
      },
    ],
  ])('answers unreachable, with no HTTP status, to %s, and does not throw', async (_, arrange) => {
    arrange();

    const found = await provider.check();

    expect(found).toEqual({
      status: 'unreachable',
      httpStatus: null,
      latencyMs: expect.any(Number),
      retryAt: null,
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  // The body can name the Cloud project: the log may keep it, the answer may not.
  it.each([
    ['the 400 API_KEY_INVALID', INVALID_KEY_BODY, 400, 'API_KEY_INVALID'],
    ['the quota of the day', DAY_QUOTA_BODY, 429, 'RESOURCE_EXHAUSTED'],
  ])(
    "logs Google's body on %s, never the key, and leaves it out of the answer",
    async (_, body, status, word) => {
      fetchMock.mockResolvedValueOnce(json(body, status));

      const found = await provider.check();

      expect(warn).toHaveBeenCalledOnce();
      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain(`key check on gemini-test: Gemini ${status}:`);
      expect(line).toContain(word);
      expect(line).not.toContain('test-key');
      expect(JSON.stringify(found)).not.toContain(word);
    },
  );

  it('logs nothing when the key works', async () => {
    fetchMock.mockResolvedValueOnce(json(ANSWERED));

    await provider.check();

    expect(warn).not.toHaveBeenCalled();
  });

  // Checks would dilute the error rate LlmErrorRateHigh alerts on, and their few
  // tokens are no learner's.
  it.each([
    ['a working key', () => json(ANSWERED)],
    ['the quota of the day', () => json(DAY_QUOTA_BODY, 429)],
  ])('counts nothing in the metrics of real calls, for %s', async (_, response) => {
    fetchMock.mockResolvedValueOnce(response());
    const labels = { provider: 'gemini', model: 'gemini-test' };

    await provider.check();

    const { values: requests } = await llmRequests.get();
    expect(requests.every(({ value }) => value === 0)).toBe(true);
    const { values: tokens } = await llmTokens.get();
    expect(tokens.every(({ value }) => value === 0)).toBe(true);
    for (const purpose of ['lesson-discussion', 'question-batch:grammar']) {
      expect(
        await seriesValue(llmRequestDuration, { ...labels, purpose }, '_count'),
      ).toBeUndefined();
    }
  });

  it('shows the provider and the model, and nothing of the key', () => {
    expect(provider.info).toStrictEqual({ provider: 'gemini', model: 'gemini-test' });
    expect(Object.values(provider.info)).not.toContain('test-key');
  });
});
