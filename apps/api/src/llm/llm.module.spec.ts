import { describe, expect, it } from 'vitest';
import { FixtureProvider } from './fixture.provider';
import { GeminiProvider } from './gemini.provider';
import { selectLlmProvider } from './llm.module';

describe('selectLlmProvider', () => {
  const fixture = {} as FixtureProvider;
  const gemini = {} as GeminiProvider;

  it('returns the fixture provider for "fixture"', () => {
    expect(selectLlmProvider('fixture', fixture, gemini)).toBe(fixture);
  });

  it('returns the Gemini provider for "gemini"', () => {
    expect(selectLlmProvider('gemini', fixture, gemini)).toBe(gemini);
  });

  it.each(['real', 'gemni', ''])('throws on unknown value %j', (name) => {
    expect(() => selectLlmProvider(name, fixture, gemini)).toThrow(/LLM_PROVIDER/);
  });
});
