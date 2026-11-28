import type { TutorInfo } from '@ft/shared';

import { LlmCheck, LlmError, LlmProvider } from './llm.provider';

/**
 * LLM_PROVIDER=disabled: a stack that runs no LLM at all, not even the fixture's
 * canned tutor. Every call fails at once with the reason "disabled", so the
 * discussion ends with the error code llm.disabled, and a restock counts as
 * llm_disabled, which the restock alert leaves out, as with the fixture.
 */
export class DisabledProvider implements LlmProvider {
  readonly info: TutorInfo = { provider: 'disabled', model: null };

  /** No key to check: the setting itself says there is no LLM. */
  async check(): Promise<LlmCheck> {
    return { status: 'disabled', latencyMs: null, httpStatus: null, retryAt: null };
  }

  async generateStructured(): Promise<never> {
    throw disabled();
  }

  // A generator that fails before its first piece: the caller's "for await" throws.
  // eslint-disable-next-line require-yield
  async *streamText(): AsyncIterable<string> {
    throw disabled();
  }
}

/** Not retryable: a second try meets the same setting. */
const disabled = () => new LlmError('LLM_PROVIDER=disabled', false, 'disabled');
