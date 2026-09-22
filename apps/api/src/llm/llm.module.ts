import { Module } from '@nestjs/common';

import { LLM_PROVIDER } from './llm.interface';
import { FixtureProvider } from './fixture.provider';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';

/**
 * LlmModule configures and provides the LLM service.
 * It dynamically selects the provider (Gemini or Fixture) based on environment configuration.
 */
@Module({
  providers: [
    // Register both provider classes so NestJS knows how to instantiate them
    FixtureProvider,
    GeminiProvider,
    {
      // The unique injection token that other services will request
      provide: LLM_PROVIDER,
      // List of dependencies NestJS must resolve and pass to the factory function below
      inject: [ConfigService, FixtureProvider, GeminiProvider],
      // Factory function executed at application startup to pick the active provider
      useFactory: (config: ConfigService, fixture: FixtureProvider, gemini: GeminiProvider) => {
        // Read LLM_PROVIDER from environment variables (defaults to 'fixture')
        const provider = config.get<string>('LLM_PROVIDER', 'fixture');
        if (provider === 'gemini') return gemini;
        return fixture;
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
