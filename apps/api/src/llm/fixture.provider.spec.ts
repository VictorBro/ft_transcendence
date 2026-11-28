import { afterEach, describe, expect, it, vi } from 'vitest';

import { FIXTURE_ANSWER, FIXTURE_FAILURES, FixtureProvider } from './fixture.provider';
import { LlmError, StreamRequest } from './llm.provider';

/** A discussion whose last message is `text`, with a signal nobody cancels unless given one. */
function request(text: string, signal = new AbortController().signal): StreamRequest {
  return {
    purpose: 'lesson-discussion',
    system: 'You are a tutor',
    messages: [{ role: 'user', text }],
    maxOutputTokens: 1000,
    signal,
  };
}

/** Reads the stream to its end, or to its failure, keeping the pieces that came before. */
async function read(stream: AsyncIterable<string>): Promise<{ pieces: string[]; error?: unknown }> {
  const pieces: string[] = [];
  try {
    for await (const piece of stream) pieces.push(piece);
    return { pieces };
  } catch (error) {
    return { pieces, error };
  }
}

describe('FixtureProvider', () => {
  // Not retryable, so a restock gives up at once and cools down instead of asking twice.
  // Disabled, so the restock alert leaves these expected failures out.
  it('declines every request as a failure nothing can retry', async () => {
    const reply = new FixtureProvider().generateStructured();

    await expect(reply).rejects.toBeInstanceOf(LlmError);
    await expect(reply).rejects.toMatchObject({
      message: 'LLM_PROVIDER=fixture writes no questions',
      retryable: false,
      reason: 'disabled',
    });
  });

  describe('check', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // No key and no network on a stack without a key: there is nothing to test.
    it('answers fixture without calling anyone', async () => {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', fetchMock);

      await expect(new FixtureProvider().check()).resolves.toEqual({
        status: 'fixture',
        latencyMs: null,
        httpStatus: null,
        retryAt: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shows no model', () => {
      expect(new FixtureProvider().info).toStrictEqual({ provider: 'fixture', model: null });
    });
  });

  describe('streamText', () => {
    it('sends the fixed answer piece by piece', async () => {
      const { pieces, error } = await read(new FixtureProvider(0).streamText(request('Why "le"?')));

      expect(error).toBeUndefined();
      expect(pieces).toEqual(FIXTURE_ANSWER);
    });

    it('fails before any text on a blocked prompt', async () => {
      const { pieces, error } = await read(
        new FixtureProvider(0).streamText(request(`Hi ${FIXTURE_FAILURES.blocked}`)),
      );

      expect(pieces).toEqual([]);
      expect(error).toMatchObject({ reason: 'blocked', retryable: false });
    });

    it('fails before any text on a timeout', async () => {
      const { pieces, error } = await read(
        new FixtureProvider(0).streamText(request(FIXTURE_FAILURES.timeout)),
      );

      expect(pieces).toEqual([]);
      expect(error).toMatchObject({ reason: 'unreachable', retryable: true });
    });

    // What GeminiProvider throws on Google's 429 for the quota of the day.
    it('fails before any text over the quota of the day, saying so', async () => {
      const { pieces, error } = await read(
        new FixtureProvider(0).streamText(request(`Hi ${FIXTURE_FAILURES.quotaDay}`)),
      );

      expect(pieces).toEqual([]);
      expect(error).toBeInstanceOf(LlmError);
      expect(error).toMatchObject({
        reason: 'rate_limited',
        retryable: false,
        quota: { scope: 'day', retryAfterS: 3600 },
      });
    });

    it('fails after part of the answer when the connection drops midway', async () => {
      const { pieces, error } = await read(
        new FixtureProvider(0).streamText(request(FIXTURE_FAILURES.midstream)),
      );

      expect(pieces).toEqual(FIXTURE_ANSWER.slice(0, 2));
      expect(error).toBeInstanceOf(LlmError);
      expect(error).toMatchObject({ reason: 'unreachable', retryable: true });
    });

    // The route aborts when the learner leaves: the stream must stop there, not finish the answer.
    it('stops when the signal is aborted', async () => {
      const controller = new AbortController();
      const pieces: string[] = [];
      const reading = (async () => {
        for await (const piece of new FixtureProvider(20).streamText(
          request('Hi', controller.signal),
        )) {
          pieces.push(piece);
          controller.abort();
        }
      })();

      await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
      expect(pieces).toEqual(FIXTURE_ANSWER.slice(0, 1));
    });

    it('reads the last message only, so an old failure word in the history does not fail it', async () => {
      const stream = new FixtureProvider(0).streamText({
        ...request('And now?'),
        messages: [
          { role: 'user', text: FIXTURE_FAILURES.blocked },
          { role: 'assistant', text: 'Sorry.' },
          { role: 'user', text: 'And now?' },
        ],
      });

      expect((await read(stream)).pieces).toEqual(FIXTURE_ANSWER);
    });
  });
});
