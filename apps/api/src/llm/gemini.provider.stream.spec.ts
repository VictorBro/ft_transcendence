import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seriesValue } from '../../test/metrics.fixtures';
import { llmRequestDuration, llmRequests, llmTokens, registry } from '../metrics/metrics';
import { GeminiProvider } from './gemini.provider';
import { LlmError, StreamRequest } from './llm.provider';

const labels = { provider: 'gemini', model: 'gemini-test', purpose: 'lesson-discussion' };
const usage = { promptTokenCount: 800, candidatesTokenCount: 40, totalTokenCount: 900 };

function request(signal = new AbortController().signal): StreamRequest {
  return {
    purpose: 'lesson-discussion',
    system: 'You are a French tutor.',
    messages: [
      { role: 'user', text: 'Why "le"?' },
      { role: 'assistant', text: 'Because "livre" is masculine.' },
      { role: 'user', text: 'And "la"?' },
    ],
    maxOutputTokens: 1000,
    signal,
  };
}

/** One SSE event carrying `reply`, as Gemini writes it. */
const event = (reply: object) => `data: ${JSON.stringify(reply)}\r\n\r\n`;
/** An event with one piece of the answer, and the finish reason on the last one. */
const piece = (text: string, finishReason?: string) =>
  event({
    candidates: [{ content: { parts: [{ text }] }, ...(finishReason && { finishReason }) }],
  });
const last = (text: string) =>
  event({
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
    usageMetadata: usage,
  });

/** A 200 whose body arrives in these packets, one per read, then ends (or fails with `cut`). */
function sse(packets: (string | Uint8Array)[], cut?: Error): Response {
  const encoder = new TextEncoder();
  const queue = [...packets];
  // pull() runs each time the reader wants more, so the cut comes after the packets
  // already read, as on a real connection. An error in start() would drop them unread.
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const packet = queue.shift();
      if (packet !== undefined) {
        controller.enqueue(typeof packet === 'string' ? encoder.encode(packet) : packet);
      } else if (cut) controller.error(cut);
      else controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

/** Reads the stream to its end, or to its failure, keeping the pieces that came before. */
async function read(stream: AsyncIterable<string>): Promise<{ pieces: string[]; error?: unknown }> {
  const pieces: string[] = [];
  try {
    for await (const text of stream) pieces.push(text);
    return { pieces };
  } catch (error) {
    return { pieces, error };
  }
}

describe('GeminiProvider.streamText', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const provider = new GeminiProvider({ apiKey: 'test-key', model: 'gemini-test' });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    registry.resetMetrics();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it('posts the conversation to the SSE endpoint, the model turns as "model", the key in a header', async () => {
    fetchMock.mockResolvedValueOnce(sse([last('Bonjour')]));

    await read(provider.streamText(request()));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': 'test-key' },
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      systemInstruction: { parts: [{ text: 'You are a French tutor.' }] },
      contents: [
        { role: 'user', parts: [{ text: 'Why "le"?' }] },
        { role: 'model', parts: [{ text: 'Because "livre" is masculine.' }] },
        { role: 'user', parts: [{ text: 'And "la"?' }] },
      ],
      generationConfig: { maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: 0 } },
    });
  });

  it('gives up on the whole answer after 90 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValueOnce(sse([last('Bonjour')]));

    await read(provider.streamText(request()));

    expect(timeout).toHaveBeenCalledExactlyOnceWith(90_000);
  });

  it('yields the text of each event as it comes, without the thoughts', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        event({ candidates: [{ content: { parts: [{ text: 'Hmm.', thought: true }] } }] }),
        piece('« La » '),
        piece('va avec '),
        last('les noms féminins.'),
      ]),
    );

    const { pieces, error } = await read(provider.streamText(request()));

    expect(error).toBeUndefined();
    expect(pieces).toEqual(['« La » ', 'va avec ', 'les noms féminins.']);
  });

  // A packet is not an event: here one event is cut in three, and "é" between its two bytes.
  it('joins an event cut across packets, even inside a character', async () => {
    const bytes = new TextEncoder().encode(last('féminin'));
    const middle = bytes.indexOf(0xc3) + 1;

    fetchMock.mockResolvedValueOnce(
      sse([bytes.slice(0, 10), bytes.slice(10, middle), bytes.slice(middle)]),
    );

    expect((await read(provider.streamText(request()))).pieces).toEqual(['féminin']);
  });

  it('reads two events that came in one packet, with plain "\\n" line endings too', async () => {
    const one = piece('Un ').replaceAll('\r\n', '\n');

    fetchMock.mockResolvedValueOnce(sse([one + last('deux')]));

    expect((await read(provider.streamText(request()))).pieces).toEqual(['Un ', 'deux']);
  });

  it('skips events without data, such as a comment', async () => {
    fetchMock.mockResolvedValueOnce(sse([': keep-alive\n\n', last('Bonjour')]));

    expect((await read(provider.streamText(request()))).pieces).toEqual(['Bonjour']);
  });

  it('fails before any text on a blocked prompt', async () => {
    fetchMock.mockResolvedValueOnce(sse([event({ promptFeedback: { blockReason: 'SAFETY' } })]));

    const { pieces, error } = await read(provider.streamText(request()));

    expect(pieces).toEqual([]);
    expect(error).toMatchObject({
      message: 'Gemini blocked the prompt: SAFETY',
      reason: 'blocked',
    });
  });

  it('fails after the pieces already sent when the answer is cut by MAX_TOKENS', async () => {
    fetchMock.mockResolvedValueOnce(sse([piece('Le passé '), piece('composé', 'MAX_TOKENS')]));

    const { pieces, error } = await read(provider.streamText(request()));

    expect(pieces).toEqual(['Le passé ', 'composé']);
    expect(error).toMatchObject({
      message: 'Gemini stopped early: MAX_TOKENS',
      reason: 'incomplete',
      retryable: false,
    });
  });

  // The filter stopped the answer, not the prompt: asking again the same way meets it again.
  it.each(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'])(
    'fails as blocked, after the pieces already sent, when a filter stops the answer (%s)',
    async (reason) => {
      fetchMock.mockResolvedValueOnce(sse([piece('Le passé '), piece('composé', reason)]));

      const { pieces, error } = await read(provider.streamText(request()));

      expect(pieces).toEqual(['Le passé ', 'composé']);
      expect(error).toMatchObject({
        message: `Gemini stopped early: ${reason}`,
        reason: 'blocked',
        retryable: false,
      });
    },
  );

  it('fails when the body ends without a finish reason', async () => {
    fetchMock.mockResolvedValueOnce(sse([piece('Le passé ')]));

    const { pieces, error } = await read(provider.streamText(request()));

    expect(pieces).toEqual(['Le passé ']);
    expect(error).toMatchObject({ message: 'Gemini stopped early: no finish reason' });
  });

  it('drops an event the body ends in the middle of', async () => {
    fetchMock.mockResolvedValueOnce(sse([piece('Le '), last('passé').slice(0, -2)]));

    const { pieces, error } = await read(provider.streamText(request()));

    expect(pieces).toEqual(['Le ']);
    expect(error).toMatchObject({ reason: 'incomplete' });
  });

  it('fails on an answer that finished with no text', async () => {
    fetchMock.mockResolvedValueOnce(sse([last('')]));

    const { error } = await read(provider.streamText(request()));

    expect(error).toMatchObject({ message: 'Gemini sent an empty answer', reason: 'incomplete' });
  });

  it('fails after the pieces already sent when the connection drops midway', async () => {
    fetchMock.mockResolvedValueOnce(sse([piece('Le passé ')], new TypeError('terminated')));

    const { pieces, error } = await read(provider.streamText(request()));

    expect(pieces).toEqual(['Le passé ']);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({
      message: 'Gemini unreachable: terminated',
      reason: 'unreachable',
      retryable: true,
    });
  });

  it('fails on an event that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(sse(['data: <html>\n\n']));

    const { error } = await read(provider.streamText(request()));

    expect(error).toMatchObject({
      message: 'Gemini response is not JSON: <html>',
      reason: 'invalid',
    });
  });

  it.each([
    [429, 'rate_limited', true],
    [503, 'http_error', true],
    [400, 'http_error', false],
  ])('fails before any text on an HTTP %i, as %s', async (status, reason, retryable) => {
    fetchMock.mockResolvedValueOnce(new Response('quota exceeded', { status }));

    const { pieces, error } = await read(provider.streamText(request()));

    expect(pieces).toEqual([]);
    expect(error).toMatchObject({ message: `Gemini ${status}: quota exceeded`, reason, retryable });
  });

  it('fails as unreachable when Gemini cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const { error } = await read(provider.streamText(request()));

    expect(error).toMatchObject({
      message: 'Gemini unreachable: fetch failed',
      reason: 'unreachable',
    });
  });

  describe('when the learner leaves', () => {
    /** A body that sends one piece, then waits until the call's signal aborts it, as fetch does. */
    function hanging(): void {
      fetchMock.mockImplementationOnce(async (_, init) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(piece('Le passé ')));
            init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
          },
        });
        return new Response(body);
      });
    }

    it('stops with the AbortError, not an LlmError, and counts no outcome', async () => {
      hanging();
      const controller = new AbortController();
      const pieces: string[] = [];

      const reading = (async () => {
        for await (const text of provider.streamText(request(controller.signal))) {
          pieces.push(text);
          controller.abort();
        }
      })();

      await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
      expect(pieces).toEqual(['Le passé ']);
      const { values } = await llmRequests.get();
      expect(values.filter(({ value }) => value > 0)).toEqual([]);
      expect(await seriesValue(llmRequestDuration, labels, '_count')).toBe(1);
    });

    it('stops before any text when the learner left before Gemini answered', async () => {
      const controller = new AbortController();
      controller.abort();
      fetchMock.mockRejectedValueOnce(controller.signal.reason);

      const { error } = await read(provider.streamText(request(controller.signal)));

      expect(error).not.toBeInstanceOf(LlmError);
      expect(error).toMatchObject({ name: 'AbortError' });
    });

    // A caller that breaks out of its loop: the body is cancelled, so the connection closes.
    it('cancels the body when the caller stops reading', async () => {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(piece('Le passé ')));
        },
        cancel,
      });
      fetchMock.mockResolvedValueOnce(new Response(body));

      for await (const text of provider.streamText(request())) {
        expect(text).toBe('Le passé ');
        break;
      }

      expect(cancel).toHaveBeenCalledOnce();
    });
  });

  describe('metrics', () => {
    beforeEach(() => {
      new GeminiProvider({ apiKey: 'test-key', model: 'gemini-test' });
    });

    it('starts the discussion outcomes at 0', async () => {
      await expect(seriesValue(llmRequests, { ...labels, outcome: 'ok' })).resolves.toBe(0);
      await expect(seriesValue(llmRequests, { ...labels, outcome: 'unreachable' })).resolves.toBe(
        0,
      );
    });

    it('counts a whole answer as ok, times it, and counts the tokens of the last event', async () => {
      fetchMock.mockResolvedValueOnce(
        sse([
          event({
            candidates: [{ content: { parts: [{ text: 'Le ' }] } }],
            usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 1, totalTokenCount: 801 },
          }),
          last('passé'),
        ]),
      );

      await read(provider.streamText(request()));

      expect(await seriesValue(llmRequests, { ...labels, outcome: 'ok' })).toBe(1);
      expect(await seriesValue(llmRequestDuration, labels, '_count')).toBe(1);
      expect(await seriesValue(llmTokens, { ...labels, type: 'output' })).toBe(40);
      expect(await seriesValue(llmTokens, { ...labels, type: 'total' })).toBe(900);
    });

    it('counts a failed answer by its reason, and still counts its tokens', async () => {
      fetchMock.mockResolvedValueOnce(
        sse([
          event({
            candidates: [{ content: { parts: [{ text: 'Le' }] }, finishReason: 'MAX_TOKENS' }],
            usageMetadata: usage,
          }),
        ]),
      );

      await read(provider.streamText(request()));

      expect(await seriesValue(llmRequests, { ...labels, outcome: 'incomplete' })).toBe(1);
      expect(await seriesValue(llmRequests, { ...labels, outcome: 'ok' })).toBe(0);
      expect(await seriesValue(llmTokens, { ...labels, type: 'total' })).toBe(900);
    });
  });
});
