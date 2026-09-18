import { createZodDto } from 'nestjs-zod';
import {
  StartCourseSchema,
  SetGoalSchema,
  SetLevelSchema,
  CourseSchema,
  CoursesSchema,
} from '@ft/shared';

export class StartCourseDto extends createZodDto(StartCourseSchema) {}
export class SetGoalDto extends createZodDto(SetGoalSchema) {}
export class SetLevelDto extends createZodDto(SetLevelSchema) {}
export class CourseDto extends createZodDto(CourseSchema) {}
export class CoursesDto extends createZodDto(CoursesSchema) {}
