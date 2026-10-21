import {
  ACHIEVEMENTS,
  type AchievementCode,
  type AchievementStat,
  CHALLENGES,
  type ChallengeCode,
  type CourseDay,
  LESSON_XP,
  type LessonKind,
  type Level,
  RANK_STEP,
  type Today,
  type Xp,
} from '@ft/shared';

/**
 * Every rule of XP, the daily challenge and the achievements (#94), beside
 * roadmap.rules.ts and for the same reason: no clock, no database, no
 * randomness. The service loads rows, calls these, and writes the result.
 * Storing and awarding is #95; what the learner sees is #97.
 *
 * "Rank" throughout, never "level": a level is the CEFR level (A1 to C2),
 * and both appear on the same page.
 */

/**
 * What a finish is worth: the day's first finish of that lesson, plus the
 * points it gains.
 *
 * The score is the client's (#82), so XP and achievements are only as honest
 * as the learner: a finish at 0 still earns LESSON_XP. Harmless while they
 * only measure the learner against themself; a leaderboard would first need
 * the score computed on the server.
 */
export function xpForFinish(countedToday: boolean, oldBest: number | null, score: number): number {
  return (countedToday ? LESSON_XP : 0) + Math.max(0, score - (oldBest ?? 0));
}

/**
 * The XP a rank opens at. Rank n to n + 1 costs n steps, so rank n has
 * 0 + 1 + … + (n - 1) behind it: RANK_STEP × n(n - 1) / 2, giving
 * 0, 100, 300, 600, 1000…
 */
function rankStartOf(rank: number): number {
  return (RANK_STEP * rank * (rank - 1)) / 2;
}

/**
 * The rank an XP total sits in, with the bounds of its bar.
 *
 * Inverting rankStartOf: n is the largest integer with n(n - 1) / 2 ≤ xp /
 * RANK_STEP, which solves to ⌊(1 + √(1 + 8xp / RANK_STEP)) / 2⌋. Exact on a
 * boundary, where 1 + 8xp / RANK_STEP is the perfect square (2n - 1)² and
 * Math.sqrt returns it without error.
 */
export function rankOf(xp: number): Omit<Xp, 'total'> {
  const rank = Math.floor((1 + Math.sqrt(1 + (8 * xp) / RANK_STEP)) / 2);
  return { rank, rankStart: rankStartOf(rank), nextRankAt: rankStartOf(rank + 1) };
}

/**
 * FNV-1a, 32 bits. Math.imul, not `*`: the product of two 32-bit numbers
 * leaves the range a double holds exactly, and only imul wraps it the way the
 * algorithm expects.
 */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * MurmurHash3's finalizer: the avalanche step, where one bit of the input
 * changes about half the bits of the output.
 *
 * FNV alone would not do here. It carries the parity of its input through to
 * its output, and the keys below differ by one day at a time, so `% 6` would
 * alternate between the even and the odd indices: three of the six challenges
 * reachable on any given day, for ever.
 */
function fmix32(hash: number): number {
  let mixed = hash;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x85ebca6b);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

/**
 * The course's challenge for a day. Derived, not stored: the same course and
 * day give the same code on any machine, for ever, with no row and no job at
 * midnight.
 */
export function challengeFor(userLevelId: string, day: CourseDay): ChallengeCode {
  return CHALLENGES[fmix32(fnv1a(`${userLevelId}:${day}`)) % CHALLENGES.length];
}

/**
 * Whether this finish does the day's challenge. `score` is this attempt's,
 * never the stored best: a redo at 50 of a lesson already at 95 does not do
 * score90. `doneCount` is the day's count after the finish, so beyondGoal
 * wants one more than the target, not the target itself.
 */
export function challengeMet(
  code: ChallengeCode,
  finish: { kind: LessonKind; score: number; doneCount: number; target: number },
): boolean {
  switch (code) {
    case 'score90':
      return finish.score >= 90;
    case 'beyondGoal':
      return finish.doneCount > finish.target;
    case 'grammar':
    case 'vocabulary':
    case 'functions':
    case 'reading':
      return finish.kind === code;
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

/**
 * What `earned` and `progress` read. One number per stat an achievement
 * names, so a new stat in ACHIEVEMENTS does not compile until it is loaded
 * here, and one levelProgress (#80) per level the page shows. A level left
 * out reads as not computed: the same empty bar as a level with no lessons.
 */
export type AchievementStats = Record<AchievementStat, number> & {
  levels: Partial<Record<Level, Today['progress']>>;
};

const BY_CODE = new Map(ACHIEVEMENTS.map((achievement) => [achievement.code, achievement]));

/**
 * How far along one achievement is, for its bar. A level code counts both
 * halves of "complete" — every lesson attempted and enough of them passed —
 * so the bar fills only when both are met, and a level with no lessons gives
 * a zero-length bar rather than a full one.
 */
export function progress(
  code: AchievementCode,
  stats: AchievementStats,
): { current: number; target: number } {
  // Non-null: AchievementCode is exactly the set of keys BY_CODE was built from.
  const achievement = BY_CODE.get(code)!;

  if ('level' in achievement) {
    const level = stats.levels[achievement.level];
    if (level === undefined) {
      return { current: 0, target: 0 };
    }
    return {
      // Both halves of #80's "complete", so the bar fills only when the level is.
      // The second min earns its keep: passed can exceed needed. The first is a
      // guard on RuleResult's "one row per lesson" contract, which only the
      // caller enforces.
      current: Math.min(level.attempted, level.total) + Math.min(level.passed, level.needed),
      target: level.total + level.needed,
    };
  }

  return {
    current: Math.min(stats[achievement.stat], achievement.target),
    target: achievement.target,
  };
}

/**
 * Every achievement the stats reach, in ACHIEVEMENTS order. A level code asks
 * levelProgress whether it is complete rather than comparing its bar: an
 * empty level has a target of 0, which `current >= target` would award.
 *
 * `complete` is trusted as is: a level is seeded whole, because
 * lesson-files.spec.ts fails a lesson file missing any entry of its outline.
 * Relax that check and a level achievement can be earned, for good, on part
 * of a level.
 */
export function earned(stats: AchievementStats): AchievementCode[] {
  return ACHIEVEMENTS.filter((achievement) =>
    'level' in achievement
      ? stats.levels[achievement.level]?.complete === true
      : stats[achievement.stat] >= achievement.target,
  ).map((achievement) => achievement.code);
}
