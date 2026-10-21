import { type CourseDay, DailyGoalSchema, type Language } from '@ft/shared';
import type { Prisma, UserLevel } from '../generated/prisma/client';
import { courseDay, isMet, metOn } from './roadmap.rules';

/*
 * The writes on a course's day: the lock, and the goal it protects.
 * Plain functions, not a service: finish (lessons.service.ts) and setGoal
 * (courses.service.ts) both call them with their own `tx`, so CoursesModule
 * needs no new provider and the two modules never import each other.
 */

/** What meetGoal did, and the course after it. #95 reads it to award XP. */
export type GoalOutcome = {
  /** This call met the day: it wrote the streak. */
  justMet: boolean;
  /** The lessons finished on that day. */
  doneCount: number;
  streak: number;
  bestStreak: number;
};

/**
 * The day and lastGoalDay columns are @db.Date: Prisma gives them back as a Date at
 * midnight UTC. toISOString() gives "2026-10-12T00:00:00.000Z", but we only want the
 * day. That is the first 10 characters.
 */
export function dayOf(date: Date): CourseDay {
  return date.toISOString().slice(0, 10);
}

/**
 * The newest of these days, or null when there is none: what courseDay
 * needs so the day never goes back. Days are "2026-10-12" texts, so sorting
 * them as text sorts them by date.
 */
export function latestDay(dates: (Date | null | undefined)[]): CourseDay | null {
  const days = dates.filter((date) => date != null).map(dayOf);
  return days.sort().at(-1) ?? null;
}

/**
 * Reads the course and locks its row until the transaction ends. A second
 * finish or goal change on the same course waits here, then reads the row
 * the first one wrote. Without it, two tabs could both miss the goal, or
 * both meet it and move the streak twice.
 *
 * Null without a course: checkCourse (course-lookup.ts) decides the error.
 * Raw SQL because Prisma has no FOR UPDATE.
 */
export async function lockCourse(
  tx: Prisma.TransactionClient,
  userId: string,
  lang: Language,
): Promise<UserLevel | null> {
  const [course] = await tx.$queryRaw<UserLevel[]>`
    SELECT * FROM "UserLevel"
    WHERE "userId" = ${userId}::uuid AND "lang" = ${lang}::"Language"
    FOR UPDATE`;
  return course ?? null;
}

/**
 * The course's day: today in the user's time zone, but never before its
 * newest result or goal day, so flying west never sends the user back to a
 * day already done. Read after lockCourse: a finish that ran just before is
 * already written.
 */
export async function currentDay(
  tx: Prisma.TransactionClient,
  course: UserLevel,
  timeZone: string,
  now: Date,
): Promise<CourseDay> {
  const newest = await tx.lessonResult.findFirst({
    where: { userLevelId: course.id },
    orderBy: { day: 'desc' },
    select: { day: true },
  });
  return courseDay(now, timeZone, latestDay([newest?.day, course.lastGoalDay]));
}

/**
 * Meets `day` if its finished lessons reach the goal and it is not met yet:
 * then metOn moves the streak, and the row is written. Called after every
 * change that can meet it: a finish, or a lower goal.
 *
 * `course` is the row from lockCourse, with the goal already written.
 */
export async function meetGoal(
  tx: Prisma.TransactionClient,
  course: UserLevel,
  day: CourseDay,
): Promise<GoalOutcome> {
  // One row per lesson, so this counts each lesson finished that day once.
  const doneCount = await tx.lessonResult.count({
    where: { userLevelId: course.id, day: new Date(day) },
  });
  let streak = {
    streak: course.streak,
    bestStreak: course.bestStreak,
    lastGoalDay: course.lastGoalDay === null ? null : dayOf(course.lastGoalDay),
  };

  const justMet =
    isMet(doneCount, DailyGoalSchema.parse(course.dailyGoal)) && streak.lastGoalDay !== day;
  if (justMet) {
    streak = metOn(streak, day);
    await tx.userLevel.update({
      where: { id: course.id },
      data: { ...streak, lastGoalDay: new Date(day) },
    });
  }

  return { justMet, doneCount, streak: streak.streak, bestStreak: streak.bestStreak };
}
