import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { DiscussionController } from './discussion.controller';
import { DiscussionService } from './discussion.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  // LlmModule exports the LLM_PROVIDER token the discussion is given.
  imports: [LlmModule],
  controllers: [LessonsController, DiscussionController],
  providers: [LessonsService, DiscussionService],
  exports: [LessonsService],
})
export class LessonsModule {}
