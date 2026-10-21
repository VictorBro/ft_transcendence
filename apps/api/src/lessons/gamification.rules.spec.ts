import {
  ACHIEVEMENTS,
  CHALLENGES,
  type ChallengeCode,
  LESSON_KINDS,
  type Level,
  type Today,
} from '@ft/shared';
import { describe, expect, it } from 'vitest';

import {
  type AchievementStats,
  challengeFor,
  challengeMet,
  earned,
  progress,
  rankOf,
  xpForFinish,
} from './gamification.rules';

const NO_STATS: AchievementStats = {
  finished: 0,
  passed: 0,
  bestStreak: 0,
  challengesDone: 0,
  levels: {},
};

const withLevel = (level: Level, progressOf: Today['progress']): AchievementStats => ({
  ...NO_STATS,
  levels: { [level]: progressOf },
});

/** levelProgress's shape (#80), built from the two numbers that decide completeness. */
const levelOf = (
  total: number,
  attempted: number,
  passed: number,
  needed: number,
): Today['progress'] => ({
  total,
  attempted,
  passed,
  needed,
  complete: total > 0 && attempted === total && passed >= needed,
});

const finish = (over: Partial<Parameters<typeof challengeMet>[1]> = {}) => ({
  kind: 'grammar' as const,
  score: 50,
  doneCount: 1,
  target: 6,
  ...over,
});

describe('xpForFinish', () => {
  it('a first finish at 80 earns 90', () => {
    expect(xpForFinish(true, null, 80)).toBe(90);
  });

  it('the same lesson again that day at 95 earns 15, and at 60 earns 0', () => {
    expect(xpForFinish(false, 80, 95)).toBe(15);
    expect(xpForFinish(false, 95, 60)).toBe(0);
  });

  it('the next day at 95 earns 10', () => {
    expect(xpForFinish(true, 95, 95)).toBe(10);
  });
});

describe('rankOf', () => {
  it('is rank 1 at 0 and at 99, rank 2 at 100', () => {
    expect(rankOf(0).rank).toBe(1);
    expect(rankOf(99).rank).toBe(1);
    expect(rankOf(100).rank).toBe(2);
  });

  it('is rank 2 at 299, rank 3 at 300, rank 4 at 600', () => {
    expect(rankOf(299).rank).toBe(2);
    expect(rankOf(300).rank).toBe(3);
    expect(rankOf(600).rank).toBe(4);
  });

  it('bounds the bar with the rank it is in and the next one', () => {
    expect(rankOf(99)).toEqual({ rank: 1, rankStart: 0, nextRankAt: 100 });
    expect(rankOf(570)).toEqual({ rank: 3, rankStart: 300, nextRankAt: 600 });
    expect(rankOf(1000)).toEqual({ rank: 5, rankStart: 1000, nextRankAt: 1500 });
  });

  it('starts each rank where the previous one ended', () => {
    for (let rank = 1; rank <= 12; rank += 1) {
      const start = rank * (rank - 1) * 50;
      expect(rankOf(start).rank, `xp ${start}`).toBe(rank);
      // One XP short of a threshold is still the rank below it.
      expect(rankOf(rankOf(start).nextRankAt - 1).rank, `xp ${start}`).toBe(rank);
    }
  });
});

describe('challengeFor', () => {
  const DAY_MS = 86_400_000;
  const days = (count: number, from = Date.UTC(2026, 0, 1)) =>
    Array.from({ length: count }, (_, index) =>
      new Date(from + index * DAY_MS).toISOString().slice(0, 10),
    );

  it('gives the same code for the same course and day', () => {
    expect(challengeFor('fixed-course-id', '2026-01-01')).toBe(
      challengeFor('fixed-course-id', '2026-01-01'),
    );
  });

  it('gives different courses their own code on the same day', () => {
    const codes = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => challengeFor(id, '2026-01-01')),
    );
    expect(codes.size).toBeGreaterThan(1);
  });

  it('spreads the six codes over 600 days, and does not follow the day', () => {
    const codes = days(600).map((day) => challengeFor('fixed-course-id', day));

    for (const code of CHALLENGES) {
      const count = codes.filter((picked) => picked === code).length;
      expect(count, code).toBeGreaterThanOrEqual(70);
      expect(count, code).toBeLessThanOrEqual(130);
    }

    // fmix32's reason to exist: FNV carries its input's parity through, so
    // without the avalanche consecutive days would alternate between the even
    // and the odd indices, leaving three of the six unreachable on any day.
    const index = (code: ChallengeCode) => CHALLENGES.indexOf(code);
    const sharedParity = codes.filter(
      (code, at) => at > 0 && index(code) % 2 === index(codes[at - 1]) % 2,
    ).length;
    const share = sharedParity / (codes.length - 1);
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  // Not a property but two exact outputs. Nothing stores the code, so a
  // different hash only changes which challenge today's card shows, but it
  // changes it for every learner at once. Red here means that is deliberate.
  // Two days, because a single one can agree with another hash by chance.
  it('pins the hash, so changing it cannot be an accident', () => {
    expect(challengeFor('fixed-course-id', '2026-01-01')).toBe('score90');
    expect(challengeFor('fixed-course-id', '2026-01-05')).toBe('grammar');
  });
});

describe('challengeMet', () => {
  it('a reading lesson at 40 meets reading', () => {
    expect(challengeMet('reading', finish({ kind: 'reading', score: 40 }))).toBe(true);
  });

  it('a lesson of another kind does not meet it', () => {
    expect(challengeMet('reading', finish({ kind: 'grammar' }))).toBe(false);
  });

  // All four, not just reading: challengeMet lists them as its own switch cases
  // so that a seventh challenge code cannot compile, and each case is a rule.
  it('meets every kind challenge with its own kind and with no other', () => {
    for (const code of LESSON_KINDS) {
      expect(challengeMet(code, finish({ kind: code })), code).toBe(true);
      for (const other of LESSON_KINDS.filter((kind) => kind !== code)) {
        expect(challengeMet(code, finish({ kind: other })), `${code} vs ${other}`).toBe(false);
      }
    }
  });

  it('89 does not meet score90, 90 does', () => {
    expect(challengeMet('score90', finish({ score: 89 }))).toBe(false);
    expect(challengeMet('score90', finish({ score: 90 }))).toBe(true);
  });

  it('judges score90 on this attempt alone, so a redo at 50 does not meet it', () => {
    // challengeMet takes no best score: the signature is what keeps a stored
    // 95 from meeting score90 on a redo. This pins the Done-when item.
    expect(challengeMet('score90', finish({ score: 50 }))).toBe(false);
  });

  it('at goal 60 the 7th finish meets beyondGoal and the 6th does not', () => {
    expect(challengeMet('beyondGoal', finish({ doneCount: 7, target: 6 }))).toBe(true);
    expect(challengeMet('beyondGoal', finish({ doneCount: 6, target: 6 }))).toBe(false);
  });
});

describe('earned', () => {
  it('a best streak of 6 earns streak3 only, 7 earns streak3 and streak7', () => {
    expect(earned({ ...NO_STATS, bestStreak: 6 })).toEqual(['streak3']);
    expect(earned({ ...NO_STATS, bestStreak: 7 })).toEqual(['streak3', 'streak7']);
  });

  it('earns nothing on an empty course', () => {
    expect(earned(NO_STATS)).toEqual([]);
  });

  it('earns firstLesson on the first finish', () => {
    expect(earned({ ...NO_STATS, finished: 1 })).toEqual(['firstLesson']);
  });

  it('levelB1 needs B1 complete, not just its pass quota', () => {
    const quotaOnly = withLevel('B1', levelOf(120, 110, 100, 96));
    expect(quotaOnly.levels.B1?.complete).toBe(false);
    expect(earned(quotaOnly)).not.toContain('levelB1');

    expect(earned(withLevel('B1', levelOf(120, 120, 100, 96)))).toContain('levelB1');
  });

  it('earns no level with no lessons, whose bar would read 0 of 0', () => {
    const empty = withLevel('A1', levelOf(0, 0, 0, 0));
    expect(progress('levelA1', empty)).toEqual({ current: 0, target: 0 });
    expect(earned(empty)).not.toContain('levelA1');
  });

  it('reads every stat an achievement names', () => {
    for (const achievement of ACHIEVEMENTS) {
      if ('level' in achievement) continue;
      const atTarget = { ...NO_STATS, [achievement.stat]: achievement.target };
      expect(earned(atTarget), achievement.code).toContain(achievement.code);
    }
  });

  it('returns the codes in the order ACHIEVEMENTS declares', () => {
    const everything: AchievementStats = {
      finished: 500,
      passed: 500,
      bestStreak: 100,
      challengesDone: 50,
      levels: Object.fromEntries(
        (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map((level) => [
          level,
          levelOf(10, 10, 10, 8),
        ]),
      ),
    };
    expect(earned(everything)).toEqual(ACHIEVEMENTS.map((achievement) => achievement.code));
  });
});

describe('progress', () => {
  it('counts a stat against its target', () => {
    expect(progress('passed25', { ...NO_STATS, passed: 3 })).toEqual({ current: 3, target: 25 });
  });

  it('caps current at target, so a bar never overfills', () => {
    expect(progress('passed25', { ...NO_STATS, passed: 999 })).toEqual({
      current: 25,
      target: 25,
    });
  });

  it('covers both halves of a level, so the bar fills only when it is complete', () => {
    // 100 passed of 96 needed, but ten lessons never attempted.
    expect(progress('levelB1', withLevel('B1', levelOf(120, 110, 100, 96)))).toEqual({
      current: 206,
      target: 216,
    });
    expect(progress('levelB1', withLevel('B1', levelOf(120, 120, 100, 96)))).toEqual({
      current: 216,
      target: 216,
    });
  });

  it('caps each half of a level separately', () => {
    // 110 passed of 96 needed would overfill the second half on its own.
    expect(progress('levelB1', withLevel('B1', levelOf(120, 120, 110, 96)))).toEqual({
      current: 216,
      target: 216,
    });
  });

  it('gives no bar for a level that was not computed', () => {
    expect(progress('levelC2', NO_STATS)).toEqual({ current: 0, target: 0 });
  });
});
