import { Module } from '@nestjs/common';

import { LLM_PROVIDER } from './llm.interface';
import { FixtureProvider } from './fixture.provider';

/**
 * Registers and exports LLM_PROVIDER bound to FixtureProvider
 * for zero-network testing and development.
 */
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      useClass: FixtureProvider,
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
