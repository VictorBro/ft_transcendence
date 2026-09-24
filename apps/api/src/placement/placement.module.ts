import { Module } from '@nestjs/common';

import { CoursesModule } from '../courses/courses.module';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';
import { PlacementStore } from './placement.store';

@Module({
  imports: [CoursesModule],
  controllers: [PlacementController],
  providers: [PlacementService, PlacementStore],
})
export class PlacementModule {}
