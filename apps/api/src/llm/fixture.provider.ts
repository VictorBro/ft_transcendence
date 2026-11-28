import { setTimeout as sleep } from 'node:timers/promises';

import type { TutorInfo } from '@ft/shared';

import { LlmCheck, LlmError, LlmProvider, StreamRequest } from './llm.provider';

/**
 * The answer streamText always gives, cut in the pieces it sends one by one.
 * It says what it is, so nobody mistakes it for a real tutor.
 */
export const FIXTURE_ANSWER = [
  'This is the fixture tutor. ',
  'It gives the same answer to every question. ',
  'Set LLM_PROVIDER=gemini for a real one.',
];

/**
 * The words that make streamText fail on purpose, one per failure the route must
 * handle. They let the e2e tests, and the defence, show each error path without a
 * network or a key.
 */
export const FIXTURE_FAILURES = {
  /** Sends part of the answer, then the connection drops. */
  midstream: '#fail-midstream',
  /** No answer comes in time. */
  timeout: '#timeout',
  /** The prompt is refused before any text. */
  blocked: '#blocked',
  /** The key is over its quota of the day, as Google's 429 says it. */
  quotaDay: '#quota-day',
} as const;

/**
 * The provider for a stack without a key: no network, no spend. It writes no
 * questions, because a canned one in the bank is served to learners as real.
 * A restock then fails like any LLM outage, and placement serves the oldest
 * question the learner has seen instead.
 *
 * It does answer a discussion, with FIXTURE_ANSWER: a fixed text is harmless
 * there, since it is never stored and says what it is.
 */
export class FixtureProvider implements LlmProvider {
  /**
   * delayMs is the pause before each piece, so the answer arrives over time like
   * a real one, and a test has the time to cancel it midway.
   */
  constructor(private readonly delayMs = 50) {}

  /** No real model behind it, so no model name. */
  readonly info: TutorInfo = { provider: 'fixture', model: null };

  /** No key and no network: nothing to check. */
  async check(): Promise<LlmCheck> {
    return { status: 'fixture', latencyMs: null, httpStatus: null, retryAt: null };
  }

  /**
   * Always fails: this provider never writes a question.
   *
   * It takes no parameter because it ignores the request. TypeScript accepts
   * this: a method that uses fewer parameters still follows the contract.
   *
   * Promise<never> means the promise never gets a value, it is only rejected.
   * "never" is the type of something that cannot happen. Here the method always
   * throws, so there is never a value to return. It is also valid for the
   * contract, because "never" fits any type.
   *
   * retryable is false: asking again would fail the same way, so the caller
   * should not try a second time. The reason, disabled, keeps these failures
   * out of the restock alert: on a stack without a key they are expected.
   */
  async generateStructured(): Promise<never> {
    throw new LlmError('LLM_PROVIDER=fixture writes no questions', false, 'disabled');
  }

  /**
   * Sends FIXTURE_ANSWER piece by piece, or fails the way the learner's last
   * message asks for (FIXTURE_FAILURES).
   *
   * "async *" makes an async generator: each "yield" hands one piece to the
   * caller's "for await" loop, then the function pauses until the loop asks for
   * the next one. A "throw" inside comes out of the caller's loop.
   *
   * sleep() gets the request's signal: when the route cancels, the pause rejects
   * with an AbortError at once, and the generator stops there, like a real call
   * whose connection is closed.
   */
  async *streamText({ messages, signal }: StreamRequest): AsyncIterable<string> {
    // "?." because the list could be empty; "?? ''" then gives a text with no word in it.
    const last = messages.at(-1)?.text ?? '';
    if (last.includes(FIXTURE_FAILURES.blocked)) {
      throw new LlmError('Fixture blocked the prompt', false, 'blocked');
    }
    if (last.includes(FIXTURE_FAILURES.timeout)) {
      throw new LlmError('Fixture timed out', true, 'unreachable');
    }
    // What GeminiProvider throws on a 429 for today's quota: back in an hour, here.
    if (last.includes(FIXTURE_FAILURES.quotaDay)) {
      throw new LlmError('Fixture is over its quota of the day', false, 'rate_limited', {
        scope: 'day',
        retryAfterS: 3600,
      });
    }
    for (const [index, piece] of FIXTURE_ANSWER.entries()) {
      // Two pieces out, then the connection "drops": the caller has already sent part of the answer.
      if (index === 2 && last.includes(FIXTURE_FAILURES.midstream)) {
        throw new LlmError('Fixture dropped the connection midway', true, 'unreachable');
      }
      await sleep(this.delayMs, undefined, { signal });
      yield piece;
    }
  }
}
