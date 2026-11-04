import { Injectable } from '@nestjs/common';
import { lessons as shared, type Language, type Locale } from '@ft/shared';

import type { LessonAttempt, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newSecret, refOf } from './attempt-ref';
import { checkCourse, findLesson } from './course-lookup';
import { lockCourse } from './goal';

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

/** The other way: what the row stores of a state, times as dates. */
function dataOf(state: AttemptState) {
  return {
    page: state.page,
    deadline: state.deadline === null ? null : new Date(state.deadline),
    answers: state.answers as unknown as Prisma.InputJsonObject,
    completedAt: state.completedAt === null ? null : new Date(state.completedAt),
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

  /**
   * POST attempt { locale }: one transaction, the course locked first, then
   * the attempt row.
   *   - an attempt in progress → it, unchanged (no restart before the results)
   *   - a finished one         → deleted, and a new one with a new secret (retake)
   *   - none                   → a new one
   * `created` tells the controller 201 from 200. The locale fixes the mother
   * tongue for the whole attempt.
   */
  start(userId: string, lang: Language, id: string, locale: Locale, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const course = checkCourse(await lockCourse(tx, userId, lang), { placed: true });
      const { lesson, source } = await findSource(tx, lang, id);
      const key = { userLevelId: course.id, lessonId: lesson.id };

      const old = await tx.lessonAttempt.findUnique({ where: { userLevelId_lessonId: key } });
      if (old && old.completedAt === null) {
        const plan = shared.player.buildPlan(source, old.motherTongue);
        return { created: false, attempt: this.parse(plan, old, now) };
      }
      if (old) {
        await tx.lessonAttempt.delete({ where: { id: old.id } });
      }

      const motherTongue = shared.player.motherTongue(locale, lang);
      const plan = shared.player.buildPlan(source, motherTongue);
      const row = await tx.lessonAttempt.create({
        data: {
          ...key,
          motherTongue,
          secret: newSecret(),
          startedAt: now,
          // Sets the deadline when the first page is an exam page.
          ...dataOf(shared.player.start(plan, now.getTime())),
        },
      });
      return { created: true, attempt: this.parse(plan, row, now) };
    });
  }

  /** The attempt view, through its strict schema: nothing else leaves. */
  private parse(plan: LessonPlan, row: LessonAttempt, now: Date) {
    return shared.player.AttemptViewSchema.parse(viewOf(plan, row, now));
  }
}
