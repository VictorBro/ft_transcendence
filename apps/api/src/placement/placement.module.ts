import { Module } from '@nestjs/common';

import { CoursesModule } from '../courses/courses.module';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';
import { PlacementSessionService } from './placement-session.service';
import { PlacementQuestionService } from './placement-question.service';
import { PlacementProgressService } from './placement-progress.service';

@Module({
  imports: [CoursesModule],
  controllers: [PlacementController],
  providers: [
    PlacementService,
    PlacementSessionService,
    PlacementQuestionService,
    PlacementProgressService,
  ],
  exports: [
    PlacementService,
    PlacementSessionService,
    PlacementQuestionService,
    PlacementProgressService,
  ],
})
export class PlacementModule {}
