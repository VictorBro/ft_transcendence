import {
  type CourseDay,
  type DailyGoal,
  EXTRA_COUNT,
  type Level,
  LESSON_MINUTES,
  LESSON_PASS_MARK,
  LEVEL_PASS_SHARE,
  LEVELS,
  type LessonId,
  type LessonStatus,
  type Today,
} from '@ft/shared';

/**
 * Every rule of the daily goal, the streak and level completion, for the
 * course roadmap (#80). No other file decides these: the lessons service
 * loads Lesson and LessonResult rows, maps them into the types below, calls
 * these functions, and writes back whatever changed.
 *
 * Pure on purpose: no clock, no database, no default time zone. The caller
 * supplies `now` and `timeZone` explicitly, so a test never has to mock one,
 * and the service is what decides when a rule actually fires.
 */

/** A level's lesson, as the service maps it from a Lesson row. */
export type RuleLesson = { id: LessonId; level: Level; position: number };

/** A learner's current state on one lesson, as the service maps it from a LessonResult row. */
export type RuleResult = {
  lessonId: LessonId;
  level: Level;
  score: number;
  day: CourseDay;
  finishedAt: Date;
};

/** A learner's streak, as the service maps it from UserLevel's streak columns. */
export type CourseStreak = { streak: number; bestStreak: number; lastGoalDay: CourseDay | null };

/** Lessons a day: the daily goal over LESSON_MINUTES (1, 3 or 6). */
export function target(goal: DailyGoal): number {
  return goal / LESSON_MINUTES;
}

/** No result: todo. A best score at or above LESSON_PASS_MARK: done. Else failed. */
export function statusOf(result?: RuleResult): LessonStatus {
  if (result === undefined) {
    return 'todo';
  }
  return result.score >= LESSON_PASS_MARK ? 'done' : 'failed';
}

/**
 * The row to write after a finish. `lesson`, not `lessonId`: a first finish
 * has no `old` to read a level from, and RuleResult always needs one.
 *
 * The score is the best of the two, but the day and finishedAt always move to
 * this finish, even a worse redo: the streak and the queue read off the most
 * recent attempt, not the best one.
 */
export function merge(
  old: RuleResult | undefined,
  lesson: RuleLesson,
  score: number,
  day: CourseDay,
  now: Date,
): RuleResult {
  return {
    lessonId: lesson.id,
    level: lesson.level,
    score: Math.max(old?.score ?? 0, score),
    day,
    finishedAt: now,
  };
}

/**
 * That day's rows, any level, pass or fail, in finish order. `results` is the
 * learner's current state, one row per lesson, so this is also how many
 * distinct lessons were finished that day: a lesson redone six times still
 * contributes one row.
 */
export function doneOn(results: RuleResult[], day: CourseDay): RuleResult[] {
  return results
    .filter((result) => result.day === day)
    .sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime());
}

/** Whether that day's done count reaches the goal. */
export function isMet(doneCount: number, goal: DailyGoal): boolean {
  return doneCount >= target(goal);
}

/**
 * The level's lessons not finished today, in the order they would be offered:
 * first the ones not yet passed (todo or failed), by position, then the
 * passed ones, least recently finished first so a review rotates rather than
 * repeating the same lesson every day.
 */
export function queue(lessons: RuleLesson[], results: RuleResult[], day: CourseDay): LessonId[] {
  const byLesson = new Map(results.map((result) => [result.lessonId, result]));
  const finishedToday = new Set(doneOn(results, day).map((result) => result.lessonId));
  const remaining = lessons.filter((lesson) => !finishedToday.has(lesson.id));

  const notPassed: RuleLesson[] = [];
  const passed: RuleLesson[] = [];
  for (const lesson of remaining) {
    (statusOf(byLesson.get(lesson.id)) === 'done' ? passed : notPassed).push(lesson);
  }

  notPassed.sort((a, b) => a.position - b.position);
  // Non-null: a lesson only lands in `passed` when statusOf read a result for
  // it, and statusOf is 'todo' without one.
  passed.sort((a, b) => {
    const atA = byLesson.get(a.id)!.finishedAt.getTime();
    const atB = byLesson.get(b.id)!.finishedAt.getTime();
    return atA - atB || a.position - b.position;
  });

  return [...notPassed, ...passed].map((lesson) => lesson.id);
}

/**
 * Today's three lists. `done` can include lessons from a level the learner
 * has since left behind: it is read off `results` directly, not off
 * `lessons`, so a level switch mid-day does not erase what was already
 * finished. `proposed` and `extra` only ever come from `lessons`, the current
 * level's.
 */
export function plan(
  lessons: RuleLesson[],
  results: RuleResult[],
  day: CourseDay,
  goal: DailyGoal,
): { done: LessonId[]; proposed: LessonId[]; extra: LessonId[] } {
  const done = doneOn(results, day).map((result) => result.lessonId);
  const upNext = queue(lessons, results, day);
  const proposedCount = Math.max(0, target(goal) - done.length);

  return {
    done,
    proposed: upNext.slice(0, proposedCount),
    extra: upNext.slice(proposedCount, proposedCount + EXTRA_COUNT),
  };
}

/**
 * A level's completion. Only results for `lessons` count, so a result from
 * another level never counts toward this one. `needed` rounds up: 80% of an
 * odd total is never met by a fraction of a lesson.
 */
export function levelProgress(lessons: RuleLesson[], results: RuleResult[]): Today['progress'] {
  const ids = new Set(lessons.map((lesson) => lesson.id));
  const relevant = results.filter((result) => ids.has(result.lessonId));

  const total = lessons.length;
  const attempted = relevant.length;
  const passed = relevant.filter((result) => result.score >= LESSON_PASS_MARK).length;
  const needed = Math.ceil(LEVEL_PASS_SHARE * total);

  return {
    total,
    attempted,
    passed,
    needed,
    complete: total > 0 && attempted === total && passed >= needed,
  };
}

/**
 * The level after this one, null after C2. Named levelAfter, not nextLevel:
 * onboarding already has a nextLevel (apps/web/lib/onboarding.ts) that maps
 * C2 to C2, for a different question ("what should this course teach").
 * Here C2 has nothing after it.
 */
export function levelAfter(level: Level): Level | null {
  return LEVELS[LEVELS.indexOf(level) + 1] ?? null;
}

/**
 * The calendar day `at` falls on in `timeZone`, as that zone's own civil
 * calendar names it. formatToParts, not `.format()`: a formatted string's
 * field order depends on the locale, but its parts are always typed, so
 * reading `year`/`month`/`day` off them is correct whatever locale is passed.
 */
export function localDay(at: Date, timeZone: string): CourseDay {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: 'year' | 'month' | 'day'): string =>
    parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * `now`'s local day, floored at `latestDay`. CourseDay strings sort
 * lexically the same as chronologically, so a plain string comparison is
 * enough. Guards the one way a clock can run backwards for a learner: flying
 * west crosses into an earlier local day than one already recorded for them.
 *
 * `latestDay` is the later of the streak's lastGoalDay and the newest
 * result's day, or null when the learner has neither yet; computing that is
 * the caller's job, since it is the one place that still touches the database.
 */
export function courseDay(now: Date, timeZone: string, latestDay: CourseDay | null): CourseDay {
  const today = localDay(now, timeZone);
  return latestDay !== null && latestDay > today ? latestDay : today;
}

/** The calendar day before `day`. Date.UTC normalises month and year rollovers. */
export function previousDay(day: CourseDay): CourseDay {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date - 1)).toISOString().slice(0, 10);
}

/**
 * The streak after a day the goal was met. Meeting `lastGoalDay` again is a
 * no-op, so lowering the goal mid-day and meeting it a second time cannot
 * inflate the streak. Meeting the day right after it extends it; anything
 * else, including a gap, restarts it at one.
 */
export function metOn(streak: CourseStreak, day: CourseDay): CourseStreak {
  if (streak.lastGoalDay === day) {
    return streak;
  }
  const consecutive = streak.lastGoalDay !== null && previousDay(day) === streak.lastGoalDay;
  const next = consecutive ? streak.streak + 1 : 1;
  return { streak: next, bestStreak: Math.max(streak.bestStreak, next), lastGoalDay: day };
}

/**
 * The streak as shown on `day`: alive if the goal was met today or yesterday,
 * zero the moment a day passes with neither. Separate from `metOn` because
 * this reads the streak without writing it, for a page view that has not met
 * today's goal yet.
 */
export function currentStreak(streak: CourseStreak, day: CourseDay): number {
  return streak.lastGoalDay === day || streak.lastGoalDay === previousDay(day) ? streak.streak : 0;
}
