import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { QuestionStockService } from './question-stock.service';

@Module({
  imports: [LlmModule],
  providers: [QuestionStockService],
  exports: [QuestionStockService],
})
export class QuestionGenerationModule {}
