import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';
import { QuestionGenerationService } from './questions-generation.service';

/**
 * Registers and exports LLM_PROVIDER bound to FixtureProvider
 * for zero-network testing and development.
 */
@Module({
  imports: [PrismaModule, LlmModule],
  providers: [QuestionGenerationService],
  exports: [QuestionGenerationService],
})
export class QuestionGenerationModule {}
