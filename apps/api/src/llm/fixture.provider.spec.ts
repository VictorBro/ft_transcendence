import { describe, expect, it } from 'vitest';

import { FixtureProvider } from './fixture.provider';
import { LlmError } from './llm.provider';

describe('FixtureProvider', () => {
  // Not retryable, so a restock gives up at once and cools down instead of asking twice.
  it('declines every request as a failure nothing can retry', async () => {
    const reply = new FixtureProvider().generateStructured();

    await expect(reply).rejects.toBeInstanceOf(LlmError);
    await expect(reply).rejects.toMatchObject({
      message: 'LLM_PROVIDER=fixture writes no questions',
      retryable: false,
    });
  });
});
