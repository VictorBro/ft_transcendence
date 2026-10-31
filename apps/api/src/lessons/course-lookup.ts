import { ConflictException, NotFoundException } from '@nestjs/common';
import { Language, LessonIdSchema } from '@ft/shared';
import type { Prisma } from '../generated/prisma/client';

/*
 * The course and lesson checks, in one place. Every route of a course uses
 * them: today, lessons and lesson here, finish in #82, achievements in #95.
 * So the same case always gives the same error, whoever asks.
 *
 * Plain functions, not a service: #82's finish calls them from its transaction,
 * with its `tx`, and plain files like lessons/goal.ts can import them too.
 */

/**
 * What a lesson card needs from Lesson: no `brief`, and no `lang`, a card has none.
 * A shopping list for Prisma: a column we never ask for cannot leak by mistake.
 * Exported, so every read of a lesson, here, in the service or in #82, asks for
 * the same fields.
 */
export const LESSON_SELECT = {
  id: true,
  level: true,
  position: true,
  kind: true,
  topic: true,
  theme: true,
  title: true,
  summary: true,
} as const;

/**
 * "The type of what Prisma gives back when I read Lesson with LESSON_SELECT".
 * The `as const` above is what lets Prisma know the exact fields.
 */
export type LessonRow = Prisma.LessonGetPayload<{ select: typeof LESSON_SELECT }>;

/**
 * Checks a course row that was already read, and throws the right error:
 *   no row           → 404 course.notFound (the user never started this language)
 *   placed, no level → 409 course.notPlaced (no placement yet)
 *
 * It reads nothing itself: the caller reads the row its own way. The reads of
 * #81 use a plain findUnique, finish in #82 uses lockCourse inside its
 * transaction. Both give the row here.
 *
 * `placed` is false by default: a single lesson can be opened before
 * placement, so that route asks for no level.
 *
 * The first two lines are for TypeScript only. With { placed: true }, it
 * knows the row that comes back has a level, never null.
 */
export function checkCourse<T extends { level: unknown }>(
  row: T | null,
  options: { placed: true },
): T & { level: NonNullable<T['level']> };
export function checkCourse<T extends { level: unknown }>(
  row: T | null,
  options?: { placed?: false },
): T;
export function checkCourse(
  row: { level: unknown } | null,
  { placed = false }: { placed?: boolean } = {},
) {
  if (!row) {
    throw new NotFoundException('course.notFound');
  }
  if (placed && row.level === null) {
    throw new ConflictException('course.notPlaced');
  }
  return row;
}

/**
 * Finds a lesson of this language, or a 404 lesson.notFound.
 *
 * `db` is the Prisma client to read with: this.prisma for a plain read, or
 * the `tx` of a transaction in #82. TransactionClient is PrismaClient without
 * the transaction methods, so PrismaService fits too.
 *
 * The lesson is searched in this language only: the id of a lesson in another
 * language gives the same 404 as a missing one.
 *
 * A malformed id names no lesson: the same 404, without asking the database.
 * 404, not 400: the front shows a 404 as "not there", a 400 as an error.
 *
 * `readyOnly` gives the same 404 for a lesson that is not ready (#84): it has
 * no files, so it cannot be played or finished.
 *
 * Call it after checkCourse, never at the same time: without a course, the
 * answer must be course.notFound, not lesson.notFound.
 */
export async function findLesson(
  db: Prisma.TransactionClient,
  lang: Language,
  id: string,
  { readyOnly = false } = {},
): Promise<LessonRow> {
  const where = readyOnly ? { id, lang, ready: true } : { id, lang };
  const lesson = LessonIdSchema.safeParse(id).success
    ? await db.lesson.findFirst({ where, select: LESSON_SELECT })
    : null;
  if (!lesson) {
    throw new NotFoundException('lesson.notFound');
  }
  return lesson;
}
