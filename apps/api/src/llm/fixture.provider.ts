import { LlmError, LlmProvider } from './llm.provider';

/**
 * The provider for a stack without a key: no network, no spend. It writes no
 * questions, because a canned one in the bank is served to learners as real.
 * A restock then fails like any LLM outage, and placement serves the oldest
 * question the learner has seen instead.
 */
export class FixtureProvider implements LlmProvider {
  async generateStructured(): Promise<never> {
    throw new LlmError('LLM_PROVIDER=fixture writes no questions', false);
  }
}
