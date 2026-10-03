import { describe, expect, it } from 'vitest';

import { FixtureProvider } from './fixture.provider';
import { GeminiProvider } from './gemini.provider';
import { createLlmProvider } from './llm.factory';

describe('createLlmProvider', () => {
  it('builds the fixture by default, and for "fixture"', () => {
    expect(createLlmProvider({})).toBeInstanceOf(FixtureProvider);
    expect(createLlmProvider({ LLM_PROVIDER: 'fixture', LLM_API_KEY: 'k' })).toBeInstanceOf(
      FixtureProvider,
    );
  });

  it('builds Gemini with the key and the model', () => {
    expect(
      createLlmProvider({ LLM_PROVIDER: 'gemini', LLM_API_KEY: 'k', LLM_MODEL: 'gemini-x' }),
    ).toStrictEqual(new GeminiProvider({ apiKey: 'k', model: 'gemini-x' }));
  });

  it.each([undefined, ''])('falls back to Flash-Lite when LLM_MODEL is %j', (model) => {
    expect(
      createLlmProvider({ LLM_PROVIDER: 'gemini', LLM_API_KEY: 'k', LLM_MODEL: model }),
    ).toStrictEqual(new GeminiProvider({ apiKey: 'k', model: 'gemini-3.1-flash-lite' }));
  });

  // The module calls this at boot, so a missing key stops the API from starting.
  it.each([undefined, ''])('refuses Gemini when LLM_API_KEY is %j', (key) => {
    expect(() => createLlmProvider({ LLM_PROVIDER: 'gemini', LLM_API_KEY: key })).toThrow(
      'LLM_PROVIDER=gemini needs LLM_API_KEY',
    );
  });

  it.each(['real', 'gemni', ''])('refuses LLM_PROVIDER=%j', (name) => {
    expect(() => createLlmProvider({ LLM_PROVIDER: name })).toThrow(
      `LLM_PROVIDER must be "fixture" or "gemini", got "${name}"`,
    );
  });
});
