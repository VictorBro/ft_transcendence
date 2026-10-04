import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { FixtureProvider } from './fixture.provider';
import { GeminiProvider } from './gemini.provider';
import { LlmModule } from './llm.module';
import { LLM_PROVIDER } from './llm.provider';

class ConfigStubModule {}

// ConfigService comes from a global module, as ConfigModule.forRoot provides it in the app.
function compile(env: Record<string, string>) {
  return Test.createTestingModule({
    imports: [
      {
        module: ConfigStubModule,
        global: true,
        providers: [{ provide: ConfigService, useValue: { get: (key: string) => env[key] } }],
        exports: [ConfigService],
      },
      LlmModule,
    ],
  }).compile();
}

describe('LlmModule', () => {
  it('builds the provider LLM_PROVIDER names, with LLM_API_KEY and LLM_MODEL', async () => {
    const moduleRef = await compile({
      LLM_PROVIDER: 'gemini',
      LLM_API_KEY: 'k',
      LLM_MODEL: 'gemini-x',
    });

    expect(moduleRef.get(LLM_PROVIDER)).toStrictEqual(
      new GeminiProvider({ apiKey: 'k', model: 'gemini-x' }),
    );
  });

  it('builds the fixture when nothing is configured', async () => {
    const moduleRef = await compile({});

    expect(moduleRef.get(LLM_PROVIDER)).toBeInstanceOf(FixtureProvider);
  });

  // Built at boot, so a missing key stops the API from starting.
  it('fails to build Gemini without a key', async () => {
    await expect(compile({ LLM_PROVIDER: 'gemini', LLM_MODEL: 'gemini-x' })).rejects.toThrow(
      'LLM_PROVIDER=gemini needs LLM_API_KEY',
    );
  });
});
