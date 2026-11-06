import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DisabledProvider } from './disabled.provider';
import { LlmError } from './llm.provider';

const failure = expect.objectContaining({ reason: 'disabled', retryable: false });

describe('DisabledProvider', () => {
  const provider = new DisabledProvider();

  it('writes no questions', async () => {
    const call = provider.generateStructured({
      purpose: 'question-batch:grammar',
      system: '',
      user: '',
      schema: z.object({}),
    });

    await expect(call).rejects.toBeInstanceOf(LlmError);
    await expect(call).rejects.toEqual(failure);
  });

  it('answers no discussion: the stream fails before its first piece', async () => {
    const pieces: string[] = [];
    const reading = (async () => {
      for await (const piece of provider.streamText()) pieces.push(piece);
    })();

    await expect(reading).rejects.toEqual(failure);
    expect(pieces).toEqual([]);
  });
});
