import { describe, expect, it } from 'vitest';

import { LlmError, type LlmFailure, type QuotaRefusal } from '../llm/llm.provider';
import { errorCode } from './discussion.controller';

/**
 * The code of the error event, by why the LLM failed. The e2e suite plays each
 * through the real route (discussion.e2e-spec.ts); this one needs no stack.
 */
describe('errorCode', () => {
  it.each([
    ['unreachable', 'llm.unavailable'],
    ['http_error', 'llm.unavailable'],
    ['invalid', 'llm.unavailable'],
    ['rate_limited', 'llm.rateLimited'],
    ['blocked', 'llm.blocked'],
    ['incomplete', 'llm.incomplete'],
    ['disabled', 'llm.disabled'],
  ] as const)('gives %s the code %s', (reason: LlmFailure, code) => {
    expect(errorCode(new LlmError('upstream', false, reason))).toBe(code);
  });

  // "Try again in a minute" would be wrong for hours: the learner is told tomorrow.
  it.each([
    [{ scope: 'day', retryAfterS: 48_933 }, 'llm.quotaExhausted'],
    [{ scope: 'day', retryAfterS: null }, 'llm.quotaExhausted'],
    [{ scope: 'minute', retryAfterS: 21 }, 'llm.rateLimited'],
  ] as const)('gives a 429 for the quota %o the code %s', (quota: QuotaRefusal, code) => {
    expect(errorCode(new LlmError('Gemini 429', true, 'rate_limited', quota))).toBe(code);
  });

  it('gives unknown to anything that is not an LlmError: a bug', () => {
    expect(errorCode(new TypeError('oops'))).toBe('unknown');
    expect(errorCode('thrown text')).toBe('unknown');
  });
});
