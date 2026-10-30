import {
  type AchievementCode,
  CHALLENGE_XP,
  type CourseDay,
  DailyGoalSchema,
  GOAL_XP,
  LESSON_PASS_MARK,
  type LessonKind,
  type Level,
} from '@ft/shared';
import type { Prisma, UserLevel } from '../generated/prisma/client';
import {
  type AchievementStats,
  challengeFor,
  challengeMet,
  earned,
  xpForFinish,
} from './gamification.rules';
import { dayOf, type GoalOutcome } from './goal';
import { levelProgress, target } from './roadmap.rules';

/*
 * The writes of XP, the daily challenge and the achievements (#95). A plain
 * function like meetGoal, for the same reason: finish (lessons.service.ts)
 * and setGoal (courses.service.ts) call it with their own `tx`, under the
 * course lock they already hold, so two finishes at once award once.
 *
 * The rules themselves are in gamification.rules.ts (#94): this file loads
 * what they read, and writes what they decide.
 */

/**
 * What happened, as award needs it. `goal` is what meetGoal returned: its
 * doneCount and bestStreak are the ones after its write, never the row that
 * lockCourse loaded.
 */
export type AwardEvent =
  | {
      type: 'finish';
      goal: GoalOutcome;
      /** The finished lesson: its kind for the challenge, its level for levelA1…levelC2. */
      lesson: { kind: LessonKind; level: Level };
      /** This attempt's score, never the stored best. */
      score: number;
      /** The best score before this finish, null on a first one. */
      oldBest: number | null;
      countedToday: boolean;
    }
  | { type: 'goal'; goal: GoalOutcome };

export type Award = {
  xpGained: number;
  challengeJustDone: boolean;
  newAchievements: AchievementCode[];
};

/**
 * Whether this finish does the day's challenge for the first time. The
 * course row was read after the lock and only award writes lastChallengeDay,
 * so a second finish at the same moment reads the first one's day here.
 */
function challengeJustDone(
  course: UserLevel,
  day: CourseDay,
  event: Extract<AwardEvent, { type: 'finish' }>,
): boolean {
  if (course.lastChallengeDay !== null && dayOf(course.lastChallengeDay) === day) {
    return false;
  }
  return challengeMet(challengeFor(course.id, day), {
    kind: event.lesson.kind,
    score: event.score,
    doneCount: event.goal.doneCount,
    target: target(DailyGoalSchema.parse(course.dailyGoal)),
  });
}

/**
 * The stats `earned` reads, after this event's writes. A finish can only
 * complete its own lesson's level, so that level alone is loaded; a goal
 * change completes none, and a level left out reads as not complete.
 */
async function statsAfter(
  tx: Prisma.TransactionClient,
  course: UserLevel,
  event: AwardEvent,
  challengesDone: number,
): Promise<AchievementStats> {
  // One query at a time: a transaction runs on one connection anyway.
  const finished = await tx.lessonResult.count({ where: { userLevelId: course.id } });
  const passed = await tx.lessonResult.count({
    where: { userLevelId: course.id, score: { gte: LESSON_PASS_MARK } },
  });
  const stats: AchievementStats = {
    finished,
    passed,
    bestStreak: event.goal.bestStreak,
    challengesDone,
    levels: {},
  };

  if (event.type === 'finish') {
    const level = event.lesson.level;
    const lessons = await tx.lesson.findMany({
      where: { lang: course.lang, level },
      select: { id: true, level: true, position: true },
    });
    const results = await tx.lessonResult.findMany({
      where: { userLevelId: course.id, lesson: { level } },
      select: { lessonId: true, score: true, day: true, finishedAt: true },
    });
    stats.levels[level] = levelProgress(
      lessons,
      results.map((result) => ({ ...result, level, day: dayOf(result.day) })),
    );
  }

  return stats;
}

/**
 * Awards what a finish or a goal change earned, inside the caller's
 * transaction:
 *   - XP: the lesson (xpForFinish), GOAL_XP when the day was just met, and
 *     CHALLENGE_XP when a finish does the day's challenge for the first time
 *   - the challenge: lastChallengeDay and challengesDone, once a day
 *   - the achievements that earned() now reaches and nothing stored yet
 *
 * `course` is the row the caller locked. Only xp, lastChallengeDay and
 * challengesDone are written, and xp as an increment: the streak columns
 * belong to meetGoal, which may just have changed them.
 */
export async function award(
  tx: Prisma.TransactionClient,
  course: UserLevel,
  day: CourseDay,
  event: AwardEvent,
): Promise<Award> {
  const challenge = event.type === 'finish' && challengeJustDone(course, day, event);
  const xpGained =
    (event.type === 'finish' ? xpForFinish(event.countedToday, event.oldBest, event.score) : 0) +
    (event.goal.justMet ? GOAL_XP : 0) +
    (challenge ? CHALLENGE_XP : 0);

  // A challenge always gains CHALLENGE_XP, so nothing to write means nothing gained.
  if (xpGained > 0) {
    await tx.userLevel.update({
      where: { id: course.id },
      data: {
        xp: { increment: xpGained },
        ...(challenge && { lastChallengeDay: new Date(day), challengesDone: { increment: 1 } }),
      },
    });
  }

  const challengesDone = course.challengesDone + (challenge ? 1 : 0);
  const stats = await statsAfter(tx, course, event, challengesDone);
  const stored = await tx.userAchievement.findMany({
    where: { userLevelId: course.id },
    select: { code: true },
  });
  const have = new Set(stored.map((row) => row.code));
  const newAchievements = earned(stats).filter((code) => !have.has(code));

  if (newAchievements.length > 0) {
    // skipDuplicates on top of the lock: the primary key stores a code once, whatever happens.
    await tx.userAchievement.createMany({
      data: newAchievements.map((code) => ({ userLevelId: course.id, code, day: new Date(day) })),
      skipDuplicates: true,
    });
  }

  return { xpGained, challengeJustDone: challenge, newAchievements };
}
