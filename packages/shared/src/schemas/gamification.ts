import { z } from 'zod';

import type { Level } from './item';

/**
 * The three gamification features, as data: XP with ranks, one daily challenge
 * and sixteen achievements (#94). The rules that read these live in
 * apps/api/src/lessons/gamification.rules.ts; what stores them is #95.
 *
 * Imports nothing but ./item on purpose. lesson.ts will import this file in
 * #95, and @ft/shared builds to CommonJS, where a cycle leaves one side
 * undefined at load. That is why the lesson kinds below are written out
 * instead of imported from lesson.ts, and why the course day is spelled
 * `z.iso.date()` here rather than reusing CourseDaySchema.
 */

/** A finish earns this, once per lesson per day, on top of the points it gains. */
export const LESSON_XP = 10;
/** Meeting the daily goal. */
export const GOAL_XP = 20;
/** Doing the day's challenge. */
export const CHALLENGE_XP = 30;
/** Rank n to n + 1 costs n of these, so the thresholds run 0, 100, 300, 600… */
export const RANK_STEP = 100;

/**
 * The six challenges, in index order: challengeFor picks one with `% 6`, so
 * this is a tuple and never an object.
 *
 * The first four are the lesson kinds, copied rather than imported (see the
 * note above). A test holds them to LESSON_KINDS.
 */
export const CHALLENGES = [
  'grammar',
  'vocabulary',
  'functions',
  'reading',
  'score90',
  'beyondGoal',
] as const;

export const ChallengeCodeSchema = z.enum(CHALLENGES);
export type ChallengeCode = z.infer<typeof ChallengeCodeSchema>;

/**
 * The sixteen achievements, in the order they are shown (#97). Two shapes:
 * a counter against one of the learner's stats, or a CEFR level being
 * complete. `earned` and `progress` tell them apart with `'level' in`.
 *
 * Written out rather than derived from LEVELS: the order is part of the
 * contract, `as const` gives AchievementCode its exact sixteen members, and a
 * code stays greppable.
 *
 * A code is stored in UserAchievement (#95), so it never changes or goes away
 * once shipped.
 */
export const ACHIEVEMENTS = [
  { code: 'firstLesson', stat: 'finished', target: 1 },
  { code: 'passed25', stat: 'passed', target: 25 },
  { code: 'passed100', stat: 'passed', target: 100 },
  { code: 'passed500', stat: 'passed', target: 500 },
  { code: 'streak3', stat: 'bestStreak', target: 3 },
  { code: 'streak7', stat: 'bestStreak', target: 7 },
  { code: 'streak30', stat: 'bestStreak', target: 30 },
  { code: 'streak100', stat: 'bestStreak', target: 100 },
  { code: 'challenges10', stat: 'challengesDone', target: 10 },
  { code: 'challenges50', stat: 'challengesDone', target: 50 },
  { code: 'levelA1', level: 'A1' },
  { code: 'levelA2', level: 'A2' },
  { code: 'levelB1', level: 'B1' },
  { code: 'levelB2', level: 'B2' },
  { code: 'levelC1', level: 'C1' },
  { code: 'levelC2', level: 'C2' },
] as const satisfies readonly ({ code: string } & (
  { stat: string; target: number } | { level: Level }
))[];

export type AchievementDefinition = (typeof ACHIEVEMENTS)[number];
export type AchievementCode = AchievementDefinition['code'];
/** The stats a counter achievement reads. AchievementStats (#94's rules) holds one field per name. */
export type AchievementStat = Extract<AchievementDefinition, { stat: string }>['stat'];

// Zod wants a tuple and `.map()` widens, so the cast restores what ACHIEVEMENTS already proves.
const ACHIEVEMENT_CODES = ACHIEVEMENTS.map((achievement) => achievement.code) as [
  AchievementCode,
  ...AchievementCode[],
];
export const AchievementCodeSchema = z.enum(ACHIEVEMENT_CODES);

const countSchema = z.number().int().min(0);

/**
 * Rank, not level: "level" is the CEFR level (A1 to C2) everywhere else in
 * this codebase. rankStart and nextRankAt are the bounds of the bar, so the
 * page draws it without recomputing a threshold.
 *
 * rankOf gives the bounds, #95 adds the total: the refine holds the two to
 * the same XP, so a bar never starts past its end.
 */
export const XpSchema = z
  .object({
    total: countSchema,
    rank: z.number().int().positive(),
    rankStart: countSchema,
    nextRankAt: z.number().int().positive(),
  })
  .refine((xp) => xp.rankStart <= xp.total && xp.total < xp.nextRankAt, {
    message: 'total must sit inside its rank',
    path: ['total'],
  });
export type Xp = z.infer<typeof XpSchema>;

/** The day's challenge for one course. Derived from a hash, so nothing stores the code. */
export const ChallengeSchema = z.object({
  code: ChallengeCodeSchema,
  done: z.boolean(),
});
export type Challenge = z.infer<typeof ChallengeSchema>;

/** levelProgress (#80) without `complete`: the numbers a level achievement labels its bar with. */
export const AchievementLevelSchema = z.object({
  total: countSchema,
  attempted: countSchema,
  passed: countSchema,
  needed: countSchema,
});
export type AchievementLevel = z.infer<typeof AchievementLevelSchema>;

/** The codes whose bar is labelled with a level, from ACHIEVEMENTS rather than by name. */
const LEVEL_CODES: ReadonlySet<AchievementCode> = new Set(
  ACHIEVEMENTS.filter((achievement) => 'level' in achievement).map(
    (achievement) => achievement.code,
  ),
);

export const AchievementSchema = z
  .object({
    code: AchievementCodeSchema,
    /** The course day it was earned, YYYY-MM-DD. Null until then. */
    day: z.iso.date().nullable(),
    /** Capped at target, so a bar never overfills. */
    current: countSchema,
    target: countSchema,
    /** Null on every code but a level one. */
    level: AchievementLevelSchema.nullable(),
  })
  .refine((achievement) => achievement.current <= achievement.target, {
    message: 'current must not exceed target',
    path: ['current'],
  })
  // Checked here rather than left to #95 and #97: the two shapes of ACHIEVEMENTS
  // are what the page branches on, so the payload has to tell them apart.
  .refine((achievement) => LEVEL_CODES.has(achievement.code) === (achievement.level !== null), {
    message: 'level is set on a level code and null on every other',
    path: ['level'],
  });
export type Achievement = z.infer<typeof AchievementSchema>;

/** GET /courses/:lang/achievements: all sixteen, in ACHIEVEMENTS order. */
export const AchievementListSchema = z.object({
  items: z.array(AchievementSchema).length(ACHIEVEMENTS.length),
});
export type AchievementList = z.infer<typeof AchievementListSchema>;
