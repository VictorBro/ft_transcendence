import { Module } from '@nestjs/common';

import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  controllers: [LessonsController, AttemptsController],
  providers: [LessonsService, AttemptsService],
  exports: [LessonsService],
})
export class LessonsModule {}
