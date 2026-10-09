import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createLlmProvider } from './llm.factory';
import { LLM_PROVIDER } from './llm.provider';

@Module({
  providers: [
    {
      // The name other classes use to ask for this provider.
      // It is a Symbol (a real value that exists at runtime),
      // because the LlmProvider interface is erased when the code is compiled.
      provide: LLM_PROVIDER,

      // The things Nest must give to the factory below.
      // Here: the ConfigService, which reads the .env file.
      // The order matches the factory's parameters.
      inject: [ConfigService],

      // A function Nest calls once, at startup, to build the provider.
      // Whatever it returns is what other classes get
      // when they ask for LLM_PROVIDER.
      useFactory: (config: ConfigService) =>
        createLlmProvider({
          LLM_PROVIDER: config.get('LLM_PROVIDER'),
          LLM_API_KEY: config.get('LLM_API_KEY'),
          LLM_MODEL: config.get('LLM_MODEL'),
        }),
    },
  ],
  // Without this, only this module can use LLM_PROVIDER.
  // Other modules that import LlmModule can use it too.
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
