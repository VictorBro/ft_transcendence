import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { QuestionStockService } from './question-stock.service';

/**
 * Everything about writing new questions with the LLM.
 * Used by PlacementModule, which calls QuestionStockService.restock on each draw.
 */
@Module({
  // LlmModule exports LLM_PROVIDER. Importing it lets QuestionStockService ask for it.
  imports: [LlmModule],
  // The classes Nest builds for this module.
  providers: [QuestionStockService],
  // The classes other modules that import this one can use.
  exports: [QuestionStockService],
})
export class QuestionGenerationModule {}
