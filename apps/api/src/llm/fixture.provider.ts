import { LlmError, LlmProvider } from './llm.provider';

/**
 * The provider for a stack without a key: no network, no spend. It writes no
 * questions, because a canned one in the bank is served to learners as real.
 * A restock then fails like any LLM outage, and placement serves the oldest
 * question the learner has seen instead.
 */
export class FixtureProvider implements LlmProvider {
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
   * should not try a second time.
   */
  async generateStructured(): Promise<never> {
    throw new LlmError('LLM_PROVIDER=fixture writes no questions', false);
  }
}
