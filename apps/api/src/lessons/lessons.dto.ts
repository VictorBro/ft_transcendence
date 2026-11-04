import { createZodDto } from 'nestjs-zod';
import {
  FinishLessonSchema,
  FinishResultSchema,
  LessonCardSchema,
  LessonPageSchema,
  LessonQuerySchema,
  lessons,
  TodaySchema,
} from '@ft/shared';

/*
 * A DTO (Data Transfer Object) describes the shape of the data that comes
 * into the API or goes out of it, like a printed order form.
 *
 * The shapes already exist as Zod schemas in @ft/shared, shared with the
 * front. But Nest and Swagger need a class, not a schema: createZodDto
 * turns a schema into a class. The {} are empty, there is nothing to add.
 */

// What goes out: these only document the answers in Swagger (/api/docs).
export class TodayDto extends createZodDto(TodaySchema) {}
export class LessonPageDto extends createZodDto(LessonPageSchema) {}
export class LessonCardDto extends createZodDto(LessonCardSchema) {}
export class FinishResultDto extends createZodDto(FinishResultSchema) {}
export class AttemptReadDto extends createZodDto(lessons.player.AttemptReadSchema) {}
export class AttemptViewDto extends createZodDto(lessons.player.AttemptViewSchema) {}
export class PageResultDto extends createZodDto(lessons.player.PageResultSchema) {}

// What comes in: the search params (?q=…&sort=…&page=…). Nest checks them
// against the schema before the controller gets them, so page=0 becomes 1
// and sort=foo becomes position, never a 400.
export class LessonQueryDto extends createZodDto(LessonQuerySchema) {}

// The body of a start: { locale }, which fixes the attempt's mother tongue.
export class StartAttemptDto extends createZodDto(lessons.player.StartAttemptSchema) {}

// The body of a page: { attemptId, answers }, the answers by unit ref.
export class SubmitPageDto extends createZodDto(lessons.player.SubmitPageSchema) {}

// The body of a finish: { score }, a whole number from 0 to 100, or a 400
// lesson.invalidScore.
export class FinishLessonDto extends createZodDto(FinishLessonSchema) {}
