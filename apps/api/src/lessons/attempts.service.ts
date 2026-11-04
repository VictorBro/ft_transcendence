import { Injectable } from '@nestjs/common';
import { lessons as shared, type Language } from '@ft/shared';

import type { LessonAttempt, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { refOf } from './attempt-ref';
import { checkCourse, findLesson } from './course-lookup';

type LessonPlan = shared.player.LessonPlan;
type AttemptState = shared.player.AttemptState;
type Results = shared.player.Results;

/*
 * The server runs every lesson attempt (#145). The plan is rebuilt from the
 * lesson row on each request with buildPlan, never stored. Every answer is
 * parsed with its strict shared schema, so no key can leave by mistake.
 */

/**
 * A ready lesson of this language, with what buildPlan reads: 404
 * lesson.notFound otherwise, as findLesson. The brief and content stay
 * on the server.
 */
async function findSource(db: Prisma.TransactionClient, lang: Language, id: string) {
  const lesson = await findLesson(db, lang, id, { readyOnly: true });
  const { brief, content } = await db.lesson.findUniqueOrThrow({
    where: { id: lesson.id },
    select: { brief: true, content: true },
  });
  // Ready means the seed checked both with validateLesson.
  const source = { brief, content } as unknown as shared.player.LessonSource;
  return { lesson, source };
}

/** The row as the attempt core reads it: times in milliseconds. */
function stateOf(row: LessonAttempt): AttemptState {
  return {
    page: row.page,
    deadline: row.deadline?.getTime() ?? null,
    answers: row.answers as unknown as AttemptState['answers'],
    completedAt: row.completedAt?.getTime() ?? null,
  };
}

/** The attempt as the learner sees it. */
function viewOf(plan: LessonPlan, row: LessonAttempt, now: Date) {
  const results = row.results as unknown as Results | null;
  return shared.player.view(plan, stateOf(row), row.id, refOf(row.secret), now.getTime(), results);
}

@Injectable()
export class AttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET attempt: the outline, and the attempt (null before the first start).
   * Read only: it never starts a timer, nor locks a page whose deadline is
   * past; remainingMs is then 0.
   */
  async read(userId: string, lang: Language, id: string, now: Date) {
    const course = checkCourse(
      await this.prisma.userLevel.findUnique({ where: { userId_lang: { userId, lang } } }),
      { placed: true },
    );
    const { lesson, source } = await findSource(this.prisma, lang, id);
    const row = await this.prisma.lessonAttempt.findUnique({
      where: { userLevelId_lessonId: { userLevelId: course.id, lessonId: lesson.id } },
    });

    // The outline holds every language, so before a start any mother tongue builds it.
    const plan = shared.player.buildPlan(
      source,
      row?.motherTongue ?? shared.player.motherTongue('en', lang),
    );
    return shared.player.AttemptReadSchema.parse({
      outline: shared.player.lessonOutline(plan),
      attempt: row ? viewOf(plan, row, now) : null,
    });
  }
}
