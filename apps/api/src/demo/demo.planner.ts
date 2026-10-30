import { type CourseDay, LESSON_MINUTES, type Level } from '@ft/shared';

import { localDay, merge, plan, type RuleLesson, type RuleResult } from '../lessons/roadmap.rules';
import { atLocalTime, daysBefore, pastScore, type Random, randomFrom, seedOf } from './demo.clock';
import type { DemoCourse } from './demo.data';

/*
 * The day planner of the demo learners (#85): turns a course of demo.data.ts
 * into the days to replay, with when each finish happens and its score. Pure,
 * no database: it does not choose the lessons. The replay asks
 * LessonsService.today for those, like a learner following the daily page.
 */

/** Past days' finishes start at 19:00 local, one lesson's length apart. */
const EVENING = 19 * 60;
/** A year: far more than any profile needs, so reaching it is a profile bug. */
const MAX_DAYS = 365;

/** A finish to replay: when, and with what score. The lesson is today's pick. */
export type PlannedFinish = { at: Date; score: number };

export type PlannedDay = {
  day: CourseDay;
  /** setLevel calls, in order, before the day's finishes. */
  switches: Level[];
  finishes: PlannedFinish[];
};

/**
 * One series of scores per learner and course, so an extra course never
 * shifts the scores of the French one.
 */
function randomOf(email: string, course: DemoCourse): Random {
  return randomFrom(seedOf(`${email}/${course.lang}`));
}

/**
 * How many days of `perDay` finishes it takes until every lesson of the level
 * has a result, picking the lessons the way the replay does: the daily plan's
 * proposed, then its extra. A failed lesson comes back first the next day, so
 * this depends on the scores, which come from the same series as the replay's.
 *
 * Runs the real rules (plan, merge) on made-up days: they only compare days,
 * so the count is the same on the real ones.
 */
export function daysToAttemptAll(
  lessons: RuleLesson[],
  perDay: number,
  course: DemoCourse,
  random: Random,
): number {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const results = new Map<string, RuleResult>();
  let at = Date.UTC(2000, 0, 1);
  let days = 0;

  while (results.size < lessons.length) {
    // Failed lessons come back first, so a low pass rate can spend whole days
    // on retries, and a pass rate of 0 never gets past the first ones.
    if (days >= MAX_DAYS) {
      throw new Error(`demo: ${course.lang} ${course.level} never gets every lesson attempted`);
    }
    const day = new Date(at).toISOString().slice(0, 10);
    const { proposed, extra } = plan(lessons, [...results.values()], day, course.goal);
    for (const id of [...proposed, ...extra].slice(0, perDay)) {
      const now = new Date((at += 60_000));
      results.set(
        id,
        merge(results.get(id), byId.get(id)!, pastScore(random, course.passRate), day, now),
      );
    }
    at += 24 * 60 * 60 * 1000;
    days++;
  }
  return days;
}

/** The finishes on each past day, yesterday first, worked out for `untilAllAttempted`. */
function pastDays(email: string, course: DemoCourse, lessons: RuleLesson[]): number[] {
  if (Array.isArray(course.days)) {
    return course.days;
  }
  const { untilAllAttempted: perDay } = course.days;
  const count = daysToAttemptAll(lessons, perDay, course, randomOf(email, course));
  return Array<number>(count).fill(perDay);
}

/**
 * Today's finishes, spread evenly between local midnight and `runNow`: the
 * first just after midnight, none at or after `runNow`, so none is in the
 * future and all fall on today.
 */
function todayFinishes(
  today: CourseDay,
  timeZone: string,
  runNow: Date,
  scores: number[],
): PlannedFinish[] {
  const midnight = atLocalTime(today, 0, timeZone).getTime();
  const step = (runNow.getTime() - midnight) / (scores.length + 1);
  return scores.map((score, i) => ({ at: new Date(midnight + Math.round(step * (i + 1))), score }));
}

/**
 * The days to replay for one course, oldest first, today last. Today is
 * localDay(runNow, timeZone). `lessons` is the level's, read only for
 * `untilAllAttempted`; an empty array is fine otherwise.
 *
 * A day with no finish and no switch is still listed: a missed day is part
 * of the story, and the replay just does nothing on it.
 */
export function planCourse(
  email: string,
  timeZone: string,
  course: DemoCourse,
  runNow: Date,
  lessons: RuleLesson[],
): PlannedDay[] {
  const today = localDay(runNow, timeZone);
  const past = pastDays(email, course, lessons);
  const oldest = Math.max(past.length, ...course.switches.map((change) => change.daysAgo));
  // A fresh series: daysToAttemptAll drew from its own, so the replay gets
  // the very scores the count was worked out with.
  const random = randomOf(email, course);

  const days: PlannedDay[] = [];
  for (let daysAgo = oldest; daysAgo >= 1; daysAgo--) {
    const day = daysBefore(today, daysAgo);
    const count = past[daysAgo - 1] ?? 0;
    days.push({
      day,
      switches: switchesOn(course, daysAgo),
      finishes: Array.from({ length: count }, (_, i) => ({
        at: atLocalTime(day, EVENING + i * LESSON_MINUTES, timeZone),
        score: pastScore(random, course.passRate),
      })),
    });
  }
  days.push({
    day: today,
    switches: switchesOn(course, 0),
    finishes: todayFinishes(today, timeZone, runNow, course.todayScores),
  });
  return days;
}

function switchesOn(course: DemoCourse, daysAgo: number): Level[] {
  return course.switches
    .filter((change) => change.daysAgo === daysAgo)
    .map((change) => change.level);
}
