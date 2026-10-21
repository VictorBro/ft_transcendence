import { describe, expect, it } from 'vitest';

import {
  ACHIEVEMENTS,
  AchievementSchema,
  CHALLENGE_XP,
  CHALLENGES,
  ChallengeSchema,
  GOAL_XP,
  LESSON_XP,
  RANK_STEP,
  XpSchema,
} from './gamification';
import { LEVELS } from './item';
import { CourseDaySchema, LESSON_KINDS } from './lesson';

/**
 * gamification.ts cannot import lesson.ts: #95 makes lesson.ts import it, and
 * @ft/shared builds to CommonJS, where a cycle leaves one side undefined at
 * load. A test is not in that cycle, so this is the one place the two things
 * copied out of lesson.ts — the lesson kinds and the course day's format — can
 * be held to their originals.
 *
 * KIND_COUNTS giving every kind at least one lesson per level — what makes
 * each kind challenge reachable — is already asserted in lesson.test.ts.
 */

describe('CHALLENGES', () => {
  it('starts with the lesson kinds, copied from LESSON_KINDS', () => {
    expect(CHALLENGES.slice(0, LESSON_KINDS.length)).toEqual([...LESSON_KINDS]);
  });

  it('adds the two that are not a kind, and nothing else', () => {
    expect(CHALLENGES.slice(LESSON_KINDS.length)).toEqual(['score90', 'beyondGoal']);
  });

  // challengeFor picks with `% CHALLENGES.length`, and the issue's distribution
  // test counts six buckets.
  it('has six codes, each used once', () => {
    expect(CHALLENGES).toHaveLength(6);
    expect(new Set(CHALLENGES).size).toBe(6);
  });
});

describe('ACHIEVEMENTS', () => {
  it('has sixteen codes, each used once', () => {
    const codes = ACHIEVEMENTS.map((achievement) => achievement.code);
    expect(codes).toHaveLength(16);
    expect(new Set(codes).size).toBe(16);
  });

  it('has one level code per CEFR level', () => {
    const levels = ACHIEVEMENTS.filter((achievement) => 'level' in achievement).map(
      (achievement) => achievement.level,
    );
    expect(levels).toEqual([...LEVELS]);
  });

  // The order is what #97 shows, so it is part of the contract rather than a detail.
  it('keeps the declared order', () => {
    expect(ACHIEVEMENTS.map((achievement) => achievement.code)).toEqual([
      'firstLesson',
      'passed25',
      'passed100',
      'passed500',
      'streak3',
      'streak7',
      'streak30',
      'streak100',
      'challenges10',
      'challenges50',
      'levelA1',
      'levelA2',
      'levelB1',
      'levelB2',
      'levelC1',
      'levelC2',
    ]);
  });

  it('gives every counter achievement a positive target', () => {
    for (const achievement of ACHIEVEMENTS) {
      if ('level' in achievement) continue;
      expect(achievement.target, achievement.code).toBeGreaterThan(0);
    }
  });
});

describe('the XP prices', () => {
  // The rules pin LESSON_XP and RANK_STEP by arithmetic (a first finish at 80
  // earns 90; rank 2 opens at 100). Nothing reads the other two until #95, so
  // without this a typo in them would ship.
  it('prices a finish, the daily goal, the challenge and a rank step', () => {
    expect([LESSON_XP, GOAL_XP, CHALLENGE_XP, RANK_STEP]).toEqual([10, 20, 30, 100]);
  });
});

describe('the schemas', () => {
  it('spells the earned day the way CourseDaySchema does', () => {
    for (const day of ['2026-10-17', '17/10/2026', '2026-10-17T00:00:00Z', '2026-02-30', '']) {
      const achievement = { code: 'passed25', day, current: 0, target: 25, level: null };
      expect(AchievementSchema.safeParse(achievement).success, day).toBe(
        CourseDaySchema.safeParse(day).success,
      );
    }
  });

  it('accepts a rank in progress', () => {
    expect(XpSchema.parse({ total: 570, rank: 3, rankStart: 300, nextRankAt: 600 })).toEqual({
      total: 570,
      rank: 3,
      rankStart: 300,
      nextRankAt: 600,
    });
  });

  it('rejects a total below its rank', () => {
    expect(
      XpSchema.safeParse({ total: 250, rank: 3, rankStart: 300, nextRankAt: 600 }).success,
    ).toBe(false);
  });

  it('rejects a total that has reached the next rank', () => {
    expect(
      XpSchema.safeParse({ total: 600, rank: 3, rankStart: 300, nextRankAt: 600 }).success,
    ).toBe(false);
  });

  it('rejects rank 0: the first rank is 1', () => {
    expect(XpSchema.safeParse({ total: 0, rank: 0, rankStart: 0, nextRankAt: 100 }).success).toBe(
      false,
    );
  });

  it('accepts an unearned achievement, whose day and level are null', () => {
    expect(
      AchievementSchema.safeParse({
        code: 'passed25',
        day: null,
        current: 3,
        target: 25,
        level: null,
      }).success,
    ).toBe(true);
  });

  it('accepts a level achievement, whose level labels the bar', () => {
    expect(
      AchievementSchema.safeParse({
        code: 'levelB1',
        day: '2026-10-17',
        current: 206,
        target: 216,
        level: { total: 120, attempted: 110, passed: 100, needed: 96 },
      }).success,
    ).toBe(true);
  });

  it('rejects a code it does not declare', () => {
    expect(
      AchievementSchema.safeParse({
        code: 'levelD1',
        day: null,
        current: 0,
        target: 1,
        level: null,
      }).success,
    ).toBe(false);
  });

  it('rejects a level on a code that has no level to label', () => {
    expect(
      AchievementSchema.safeParse({
        code: 'passed25',
        day: null,
        current: 0,
        target: 25,
        level: { total: 1, attempted: 0, passed: 0, needed: 1 },
      }).success,
    ).toBe(false);
  });

  it('rejects a level code without its level', () => {
    expect(
      AchievementSchema.safeParse({
        code: 'levelB1',
        day: null,
        current: 0,
        target: 0,
        level: null,
      }).success,
    ).toBe(false);
  });

  it('rejects a bar past its end, which progress caps', () => {
    expect(
      AchievementSchema.safeParse({
        code: 'passed25',
        day: null,
        current: 26,
        target: 25,
        level: null,
      }).success,
    ).toBe(false);
  });

  it('rejects a day that is not YYYY-MM-DD', () => {
    expect(
      AchievementSchema.safeParse({
        code: 'passed25',
        day: '17/10/2026',
        current: 0,
        target: 25,
        level: null,
      }).success,
    ).toBe(false);
  });

  it('accepts a challenge', () => {
    expect(ChallengeSchema.safeParse({ code: 'score90', done: true }).success).toBe(true);
    expect(ChallengeSchema.safeParse({ code: 'nope', done: true }).success).toBe(false);
  });
});
