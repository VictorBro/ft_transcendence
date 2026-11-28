import { describe, expect, it } from 'vitest';

import { DisabledProvider } from './disabled.provider';
import { LlmError } from './llm.provider';

const failure = expect.objectContaining({ reason: 'disabled', retryable: false });

describe('DisabledProvider', () => {
  const provider = new DisabledProvider();

  it('writes no questions', async () => {
    // No argument, as streamText() below: the class's own method takes none.
    const call = provider.generateStructured();

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

  it('has no key to check, and shows no model', async () => {
    await expect(provider.check()).resolves.toEqual({
      status: 'disabled',
      latencyMs: null,
      httpStatus: null,
      retryAt: null,
    });
    expect(provider.info).toStrictEqual({ provider: 'disabled', model: null });
  });
});
