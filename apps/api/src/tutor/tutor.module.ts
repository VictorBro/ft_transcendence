import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { TutorController } from './tutor.controller';
import { TutorService } from './tutor.service';

@Module({
  // LlmModule exports LLM_PROVIDER: the same instance the discussion and the restocks use.
  imports: [LlmModule],
  controllers: [TutorController],
  providers: [TutorService],
})
export class TutorModule {}
