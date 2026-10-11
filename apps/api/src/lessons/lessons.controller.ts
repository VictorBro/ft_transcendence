import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';

@ApiTags('lessons')
@Controller('courses/:lang')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}
}
