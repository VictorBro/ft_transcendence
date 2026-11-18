import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { DiscussionController } from './discussion.controller';
import { DiscussionService } from './discussion.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  // LlmModule exports the LLM_PROVIDER token the discussion is given.
  imports: [GatewayModule, LlmModule],
  controllers: [LessonsController, AttemptsController, DiscussionController],
  providers: [LessonsService, AttemptsService, DiscussionService],
  exports: [LessonsService],
})
export class LessonsModule {}
