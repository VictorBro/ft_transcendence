import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import {
  DailyGoalSchema,
  FinishResult,
  FinishResultSchema,
  Language,
  LessonCard,
  LessonCardSchema,
  LessonId,
  LessonPageSchema,
  LessonQuery,
  LESSONS_PAGE_SIZE,
  SessionUser,
  TodaySchema,
} from '@ft/shared';
import {
  courseDay,
  CourseStreak,
  currentStreak,
  isMet,
  levelAfter,
  levelProgress,
  merge,
  plan,
  RuleResult,
  statusOf,
  target,
} from './roadmap.rules';
import { checkCourse, findLesson, LESSON_SELECT, LessonRow } from './course-lookup';
import { currentDay, dayOf, latestDay, lockCourse, meetGoal } from './goal';
import { searchLessons } from './lesson-search';

/*
 * The 3 selects are shopping lists for Prisma: "from this table, bring me
 * only these columns". Without a select, Prisma brings every column, and
 * Lesson has a `brief` column (the whole lesson content) that these routes
 * must never send. A column we never ask for cannot leak by mistake.
 *
 * Written once, so every query asks for the same fields. LESSON_SELECT lives
 * in course-lookup.ts, because #82 reads lessons with it too.
 *
 * `as const` tells TypeScript the values are exactly `true`, not any boolean.
 * That is how Prisma knows exactly which fields come back (see ResultRow below).
 */

/**
 * A user's course in one language (UserLevel):
 *   id          → to find the course's results
 *   level       → A1, A2…, or null before placement (the 409)
 *   dailyGoal   → 10, 30 or 60 minutes a day
 *   streak, bestStreak, lastGoalDay → for the streak of days
 */
const COURSE_SELECT = {
  id: true,
  level: true,
  dailyGoal: true,
  streak: true,
  bestStreak: true,
  lastGoalDay: true,
} as const;

/**
 * What a user did on a lesson (LessonResult): which lesson, which score,
 * which day, at what time. Plus the lesson itself, in the same query: the
 * rules need its level, and its card is shown even when it comes from an
 * older level. It goes through LESSON_SELECT, so still no `brief`.
 */
const RESULT_SELECT = {
  lessonId: true,
  score: true,
  day: true,
  finishedAt: true,
  lesson: { select: LESSON_SELECT },
} as const;

/**
 * To write toRuleResult(row), TypeScript must know what `row` is.
 * Prisma can work out the exact type of a row from the select.
 * In plain words: "the type of what Prisma gives back when I read LessonResult with RESULT_SELECT".
 * This is where the `as const` above helps: without it, Prisma would not know the exact fields.
 * LessonRow, the same for Lesson, is in course-lookup.ts with LESSON_SELECT.
 */
type ResultRow = Prisma.LessonResultGetPayload<{ select: typeof RESULT_SELECT }>;

/**
 * Turns a result row from Prisma into what the rules (roadmap.rules.ts) expect.
 * Two things change on the way:
 *   level → the row has no level of its own, so we take the one of its lesson
 *   day   → a Date from the database, made into a "2026-10-12" text by dayOf
 */
function toRuleResult(row: ResultRow): RuleResult {
  return {
    lessonId: row.lessonId,
    level: row.lesson.level,
    score: row.score,
    day: dayOf(row.day),
    finishedAt: row.finishedAt,
  };
}

/**
 * Builds a lesson card, the object the front shows in the lesson lists.
 * It glues 2 things together:
 *   the lesson → the same for everyone: title, summary, kind…
 *   the result → the user's own: did they do it, with what score, which day
 *
 * No result means the lesson was never started: status is 'todo', and
 * score, day and finishedAt are null. `result?.` reads the field only if
 * there is a result, and `?? null` turns the missing value into null.
 */
function toCard(lesson: LessonRow, result?: RuleResult): LessonCard {
  return {
    ...lesson,
    status: statusOf(result),
    score: result?.score ?? null,
    day: result?.day ?? null,
    finishedAt: result?.finishedAt.toISOString() ?? null,
  };
}

/**
 * A phone book of results: give a lesson id, get the user's result on it.
 * A lesson never started has none: get gives undefined, and toCard makes it
 * a 'todo' card.
 */
function resultsById(results: RuleResult[]): Map<LessonId, RuleResult> {
  return new Map(results.map((result) => [result.lessonId, result]));
}

/**
 * A phone book of cards: give a lesson id, get its card back.
 *
 * plan() only gives lesson ids, and the front wants cards, so today looks
 * each id up here. A lesson given twice (a lesson of the level that has a
 * result) is set twice under the same id. It is the same card, so the second
 * set just replaces the first.
 */
function cardsById(
  lessons: LessonRow[],
  results: Map<LessonId, RuleResult>,
): Map<LessonId, LessonCard> {
  return new Map(lessons.map((lesson) => [lesson.id, toCard(lesson, results.get(lesson.id))]));
}

/*
 * Every answer is parsed with its shared schema before it leaves
 * (LessonCardSchema, LessonPageSchema, TodaySchema). One bad card fails the
 * whole reply with a 500, and that is on purpose:
 *   - the seed already checks every lesson with the same rules, and the
 *     finish route checks every score, so a card that fails here is corrupt
 *     data, a bug to see in the log, not something to hide;
 *   - dropping the bad card quietly would make `total` lie about `items`;
 *   - the strict card schema is what makes sure a `brief` never leaves.
 */
@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads the user's course in one language, or null if they never started it.
   * A user has one course per language, so userId and lang together point to
   * exactly one row: that is the `userId_lang` key.
   *
   * It throws nothing: checkCourse (course-lookup.ts) decides the error, the
   * same way for every route of a course, #82 included.
   */
  private findCourse(userId: string, lang: Language) {
    return this.prisma.userLevel.findUnique({
      where: { userId_lang: { userId, lang } },
      select: COURSE_SELECT,
    });
  }

  /**
   * What today and lessons both need before they can work: the course, its
   * level, the lessons of that level, all the course's results, and today's day.
   */
  private async load(userId: string, lang: Language, timeZone: string, now: Date) {
    // No level yet means no placement: we cannot know which lessons to show,
    // so `placed` asks checkCourse for the 409. After it, TypeScript knows the
    // level is not null.
    const course = checkCourse(await this.findCourse(userId, lang), { placed: true });
    const level = course.level;

    // The 2 queries do not need each other, so they run at the same time.
    // The results are NOT filtered by level: after a level change at noon,
    // the lessons of the old level finished this morning must stay in today's done.
    // Every lesson of the level, ready or not: the list shows them all.
    const [rows, results] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { lang, level },
        orderBy: { position: 'asc' },
        select: { ...LESSON_SELECT, ready: true },
      }),
      this.prisma.lessonResult.findMany({
        where: { userLevelId: course.id },
        select: RESULT_SELECT,
      }),
    ]);

    // Today in the user's time zone, but never before the newest day we know
    // of: flying west could otherwise send the user back to a day already done.
    const day = courseDay(
      now,
      timeZone,
      latestDay([...results.map((result) => result.day), course.lastGoalDay]),
    );

    // `ready` is for the rules only (plan and levelProgress skip a lesson that
    // is not): the strict card schema has no such field, so the cards get
    // the rows without it.
    const lessons = rows.map(({ ready: _ready, ...lesson }) => lesson);
    return { course, level, lessons, ruleLessons: rows, results, day };
  }

  /**
   * GET /courses/:lang/lessons: one page of the level's lessons, filtered,
   * sorted and cut by searchLessons. Only the current level's lessons: the
   * cards are taken in the order of `lessons`, so older levels never show up.
   */
  async lessons(userId: string, lang: Language, timeZone: string, now: Date, query: LessonQuery) {
    const { lessons, results: rows, day } = await this.load(userId, lang, timeZone, now);
    const results = resultsById(rows.map(toRuleResult));
    const levelCards = lessons.map((lesson) => toCard(lesson, results.get(lesson.id)));
    const search = searchLessons(levelCards, query, lang);

    return LessonPageSchema.parse({
      day,
      levelTotal: lessons.length,
      ...search,
      pageSize: LESSONS_PAGE_SIZE,
    });
  }

  /**
   * GET /courses/:lang/lessons/:id: the card of one lesson.
   * checkCourse without `placed`: no 409, so a course without a level can still
   * open a lesson. findLesson searches this language only, so the id of a
   * lesson in another language gives a 404, like a missing or malformed one.
   */
  async lesson(userId: string, lang: Language, id: string) {
    // The course first, on its own: findLesson throws too, and without a
    // course the answer must be course.notFound, not lesson.notFound.
    const course = checkCourse(await this.findCourse(userId, lang));

    // The lesson before its result: a malformed or missing id stops here, so
    // the result is only looked for on a lesson that exists.
    const lesson = await findLesson(this.prisma, lang, id);
    const row = await this.prisma.lessonResult.findFirst({
      where: { lessonId: lesson.id, userLevelId: course.id },
      select: RESULT_SELECT,
    });

    return LessonCardSchema.parse(toCard(lesson, row ? toRuleResult(row) : undefined));
  }

  /**
   * GET /courses/:lang/today: what to do today. The lessons done, proposed
   * and extra (plan gives ids, cardsById turns them into cards), the daily
   * target, the streak of days, and the progress in the level. Proposed,
   * extra and progress read the level's ready lessons only.
   *
   * `results: rows`: load gives Prisma rows. The rules need RuleResults, so
   * the name `results` is kept for those. Each row is turned into one once.
   */
  async today(userId: string, lang: Language, timeZone: string, now: Date) {
    const {
      course,
      level,
      lessons,
      ruleLessons,
      results: rows,
      day,
    } = await this.load(userId, lang, timeZone, now);

    const goal = DailyGoalSchema.parse(course.dailyGoal);
    const results = rows.map(toRuleResult);
    // The lessons of the results first, even from an older level: after a
    // level change at noon, a lesson done this morning is still in done.
    // Then the lessons of the current level, done or not.
    const cards = cardsById([...rows.map((row) => row.lesson), ...lessons], resultsById(results));
    const toCards = (ids: LessonId[]) => ids.map((id) => cards.get(id)!);
    const { done, proposed, extra } = plan(ruleLessons, results, day, goal);

    const streak: CourseStreak = {
      streak: course.streak,
      bestStreak: course.bestStreak,
      lastGoalDay: course.lastGoalDay === null ? null : dayOf(course.lastGoalDay),
    };

    return TodaySchema.parse({
      day,
      target: target(goal),
      met: isMet(done.length, goal),
      done: toCards(done),
      proposed: toCards(proposed),
      extra: toCards(extra),
      streak: {
        current: currentStreak(streak, day),
        best: course.bestStreak,
        today: streak.lastGoalDay === day,
      },
      progress: levelProgress(ruleLessons, results),
      levelAfter: levelAfter(level),
    });
  }

  /**
   * PUT /courses/:lang/lessons/:id/result: records a finished lesson. One
   * transaction under the course lock, so two finishes at once count the
   * day's goal once:
   *   1. the course, locked: 404 without one, 409 before placement
   *   2. the lesson: 404 if it is missing or from another language
   *   3. the result: the best score stays, the day and time move to this finish
   *   4. the goal: meetGoal meets the day if this finish reached it
   */
  finish(
    user: SessionUser,
    lang: Language,
    id: LessonId,
    score: number,
    now: Date,
  ): Promise<FinishResult> {
    return this.prisma.$transaction(async (tx) => {
      const course = checkCourse(await lockCourse(tx, user.id, lang), { placed: true });
      const lesson = await findLesson(tx, lang, id);

      const day = await currentDay(tx, course, user.timeZone, now);
      const key = { userLevelId: course.id, lessonId: lesson.id };
      const old = await tx.lessonResult.findUnique({
        where: { userLevelId_lessonId: key },
        select: RESULT_SELECT,
      });

      const result = merge(old ? toRuleResult(old) : undefined, lesson, score, day, now);
      const data = { score: result.score, day: new Date(day), finishedAt: now };
      await tx.lessonResult.upsert({
        where: { userLevelId_lessonId: key },
        create: { ...key, ...data },
        update: data,
      });

      const goal = await meetGoal(tx, course, day);
      return FinishResultSchema.parse({
        // A lesson finished twice in a day counts once: the first time.
        countedToday: old === null || dayOf(old.day) !== day,
        doneCount: goal.doneCount,
        target: target(DailyGoalSchema.parse(course.dailyGoal)),
        goalJustMet: goal.justMet,
      });
    });
  }
}
