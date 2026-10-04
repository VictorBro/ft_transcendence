import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createLlmProvider } from './llm.factory';
import { LLM_PROVIDER } from './llm.provider';

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createLlmProvider({
          LLM_PROVIDER: config.get('LLM_PROVIDER'),
          LLM_API_KEY: config.get('LLM_API_KEY'),
          LLM_MODEL: config.get('LLM_MODEL'),
        }),
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
