import { Module } from '@nestjs/common';

import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  controllers: [CoursesController],
  providers: [CoursesService],
  // The placement exam writes its verdict through setLevel, so the level keeps one writer.
  exports: [CoursesService],
})
export class CoursesModule {}
