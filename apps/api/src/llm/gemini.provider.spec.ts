import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { GeminiProvider } from './gemini.provider';
import { LlmError } from './llm.provider';

const schema = z.object({ answer: z.string() });
const request = {
  purpose: 'question-batch:grammar',
  system: 'You write placement questions.',
  user: 'Write one.',
  schema,
} as const;

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

function reply(parts: { text?: string; thought?: boolean }[], finishReason = 'STOP') {
  return json({
    candidates: [{ finishReason, content: { parts } }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, totalTokenCount: 1650 },
  });
}

describe('GeminiProvider', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const provider = new GeminiProvider({ apiKey: 'test-key', model: 'gemini-test' });
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  async function failure(response: Response | Error): Promise<LlmError> {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
    const error = await provider.generateStructured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    return error as LlmError;
  }

  it('posts the prompt with the JSON schema of the reply, the key in a header and never in the URL', async () => {
    fetchMock.mockResolvedValueOnce(reply([{ text: '{"answer":"ist"}' }]));

    await provider.generateStructured(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': 'test-key' },
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(schema),
      },
    });
  });

  it('aborts the request after 60 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValueOnce(reply([{ text: '{"answer":"ist"}' }]));

    await provider.generateStructured(request);

    expect(timeout).toHaveBeenCalledExactlyOnceWith(60_000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(timeout.mock.results[0].value);
  });

  it('joins the parts of the reply, skips the thoughts and parses the result with the schema', async () => {
    fetchMock.mockResolvedValueOnce(
      reply([
        { text: 'Let me think.', thought: true },
        { text: '{"answer":' },
        { text: '"ist", "extra": 1}' },
      ]),
    );

    await expect(provider.generateStructured(request)).resolves.toEqual({ answer: 'ist' });
  });

  it('logs the purpose, the model, the tokens and the latency of each call', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(10_000).mockReturnValueOnce(12_500);
    fetchMock.mockResolvedValueOnce(reply([{ text: '{"answer":"ist"}' }]));

    await provider.generateStructured(request);

    expect(log).toHaveBeenCalledExactlyOnceWith(
      'question-batch:grammar on gemini-test: 1200 in, 300 out, 1650 total tokens, 2500 ms',
    );
  });

  it('logs a reply without token counts, and still parses it', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(10_000).mockReturnValueOnce(12_500);
    fetchMock.mockResolvedValueOnce(
      json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"answer":"ist"}' }] } }],
      }),
    );

    await expect(provider.generateStructured(request)).resolves.toEqual({ answer: 'ist' });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'question-batch:grammar on gemini-test: ? in, ? out, ? total tokens, 2500 ms',
    );
  });

  it.each([
    [408, true],
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
  ])('treats an HTTP %i as retryable: %s', async (status, retryable) => {
    const error = await failure(new Response('quota exceeded', { status }));

    expect(error).toMatchObject({ message: `Gemini ${status}: quota exceeded`, retryable });
  });

  it.each([
    new TypeError('fetch failed'),
    new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    new DOMException('This operation was aborted', 'AbortError'),
  ])('retries when Gemini cannot be reached or times out: $name', async (cause) => {
    const error = await failure(cause);

    expect(error).toMatchObject({
      message: `Gemini unreachable: ${cause.message}`,
      retryable: true,
    });
  });

  it('retries when the connection drops while the body is read', async () => {
    const cut = new ReadableStream({ start: (body) => body.error(new TypeError('terminated')) });
    const error = await failure(new Response(cut));

    expect(error).toMatchObject({ message: 'Gemini unreachable: terminated', retryable: true });
  });

  it('retries a 200 whose body is not JSON, as a proxy page is', async () => {
    const error = await failure(new Response('<html>Bad gateway</html>'));

    expect(error).toMatchObject({
      message: 'Gemini response is not JSON: <html>Bad gateway</html>',
      retryable: true,
    });
  });

  it('does not retry a blocked prompt', async () => {
    const error = await failure(json({ promptFeedback: { blockReason: 'SAFETY' } }));

    expect(error).toMatchObject({ message: 'Gemini blocked the prompt: SAFETY', retryable: false });
  });

  // MAX_TOKENS above all: the same prompt would be cut at the same length again.
  it.each(['MAX_TOKENS', 'SAFETY', 'RECITATION'])(
    'does not retry a reply that stopped with %s',
    async (finishReason) => {
      const error = await failure(reply([{ text: '{"answer":' }], finishReason));

      expect(error).toMatchObject({
        message: `Gemini stopped early: ${finishReason}`,
        retryable: false,
      });
    },
  );

  it('does not retry a reply without a candidate', async () => {
    const error = await failure(json({ candidates: [] }));

    expect(error).toMatchObject({
      message: 'Gemini stopped early: no candidate',
      retryable: false,
    });
  });

  it('does not retry a candidate without a finish reason', async () => {
    const error = await failure(
      json({ candidates: [{ content: { parts: [{ text: '{"answer":"ist"}' }] } }] }),
    );

    expect(error).toMatchObject({
      message: 'Gemini stopped early: no finish reason',
      retryable: false,
    });
  });

  it('retries a reply that is not JSON, quoting no more than its start', async () => {
    const error = await failure(reply([{ text: `Here you go: ${'x'.repeat(300)}` }]));

    expect(error).toMatchObject({
      message: `Gemini reply is not JSON: Here you go: ${'x'.repeat(187)}`,
      retryable: true,
    });
  });

  it.each([
    ['no parts', []],
    ['only thoughts', [{ text: 'Let me think.', thought: true }]],
  ])('retries a finished reply with %s, as one that is not JSON', async (_, parts) => {
    const error = await failure(reply(parts));

    expect(error).toMatchObject({ message: 'Gemini reply is not JSON: ', retryable: true });
  });

  it('retries a reply that fails the schema, saying why', async () => {
    const error = await failure(reply([{ text: '{"answer":3}' }]));

    expect(error.retryable).toBe(true);
    expect(error.message).toMatch(/expected string.*\n.*at answer/);
  });
});
